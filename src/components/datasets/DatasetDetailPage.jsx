import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "../../analysis.css";
import { useCsvAnalysis } from "../../hooks/useCsvAnalysis.js";
import { filterRows, InvalidFilterError } from "../../utils/filterRows.js";
import { buildRowIndex, excludeHiddenRows } from "../../utils/hiddenRows.js";
import { pivot } from "../../utils/pivot.js";
import { applyFieldMove } from "../../utils/pivotEdit.js";
import { sortRows } from "../../utils/sortRows.js";
import { AnalysisTable } from "../analysis/AnalysisTable.jsx";
import { CollapsibleSection } from "../analysis/CollapsibleSection.jsx";
import { CorrelationMatrix } from "../analysis/CorrelationMatrix.jsx";
import { FilterBar } from "../analysis/FilterBar.jsx";
import { PivotPanel } from "../analysis/PivotPanel.jsx";
import { StatsPanel } from "../analysis/StatsPanel.jsx";
import { ChartBuilder } from "../charts/ChartBuilder.jsx";
import { DraggableField, FieldDndProvider } from "../dnd/FieldDnd.jsx";
import { SaveViewDialog } from "../views/SaveViewDialog.jsx";
import { SavedViewSelect } from "../views/SavedViewSelect.jsx";
import { EMPTY_CONFIG, sanitizeConfig } from "../views/viewConfig.js";
import { DatasetHeader } from "./DatasetHeader.jsx";
import { UploadNotice } from "./UploadNotice.jsx";

const NO_ROWS = [];
const NO_COLUMNS = [];

const isNotFound = (e) => e?.name === "NotFoundError";

/**
 * データセット詳細（分析）画面 /datasets/:id（docs/03 7 章、docs/05、
 * docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md）。
 * 設定はこの画面が持ち、views.config と同じ形 { filters, sort, hiddenRows, hiddenColumns, pivot, chart } にする（設計書 9 章）。
 * 行の流れ: 元の行 → 非表示の行を除く → 絞り込み → 並べ替え（設計書 6.2）。全セクションはこの後の行を使う。
 * 配置: 左にデータ表、右上にグラフ、右下に集計（設計書 5.1）。統計・相関はその下に置き、初期は閉じる。
 */
export function DatasetDetailPage({
  datasetRepository,
  viewRepository,
  currentUser,
  ownerNames = {},
  createWorker,
  onDatasetsChanged,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { parse } = useCsvAnalysis({ createWorker });

  // 呼び出し側が毎回新しいオブジェクトを渡しても、読み込みのやり直しは id / 再試行だけで起こす
  const datasetRepositoryRef = useRef(datasetRepository);
  datasetRepositoryRef.current = datasetRepository;
  const viewRepositoryRef = useRef(viewRepository);
  viewRepositoryRef.current = viewRepository;
  // 条件の追加時に検証のため計算した絞り込み結果（同じ行・同じ条件の配列なら、表示でも使い回す）
  const validatedFilterRef = useRef(null);

  const [load, setLoad] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState(EMPTY_CONFIG);
  const [notice, setNotice] = useState(null); // 操作の失敗など（alert）
  const [views, setViews] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState(null);
  const [viewWarning, setViewWarning] = useState(null);
  const [dialog, setDialog] = useState(null); // null | { mode: 'create' } | { mode: 'edit', view }
  const [dialogError, setDialogError] = useState(null);
  const [helpTerm, setHelpTerm] = useState(null);

  // 読込: get → downloadCsv → Worker でパース
  useEffect(() => {
    let cancelled = false;
    validatedFilterRef.current = null; // 前のデータの行を握り続けない
    setLoad({ status: "loading" });
    setSettings(EMPTY_CONFIG);
    setNotice(null);
    setViews([]);
    setSelectedViewId(null);
    setViewWarning(null);
    setDialog(null);
    (async () => {
      try {
        const dataset = await datasetRepositoryRef.current.get(id);
        const buffer = await datasetRepositoryRef.current.downloadCsv(id);
        const parsed = await parse(buffer);
        if (!cancelled) setLoad({ status: "ready", dataset, ...parsed });
      } catch (e) {
        if (!cancelled) {
          setLoad(isNotFound(e) ? { status: "notfound" } : { status: "error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, attempt, parse]);

  // 保存済みビューの一覧
  const ready = load.status === "ready";
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    viewRepositoryRef.current.listByDataset(id).then(
      (list) => {
        if (!cancelled) setViews(list);
      },
      () => {
        if (!cancelled) setNotice("保存済みのビューを取得できませんでした。");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, id]);

  const rows = load.rows ?? NO_ROWS;
  const columns = load.columns ?? NO_COLUMNS;
  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);
  const typeOf = useCallback(
    (name) => columns.find((c) => c.name === name)?.type ?? "string",
    [columns],
  );
  // 行オブジェクト → 元の行番号（並べ替え・絞り込み後の行から、隠す行を元の番号で覚える）
  const rowIndex = useMemo(() => buildRowIndex(rows), [rows]);

  // 非表示の行を除く（絞り込みより前）
  const visibleRows = useMemo(
    () => excludeHiddenRows(rows, settings.hiddenRows),
    [rows, settings.hiddenRows],
  );

  // フィルタ。不正な条件（ビュー由来）があるときは、絞り込まず全件を使う
  const filtered = useMemo(() => {
    if (settings.filters.length === 0) {
      return { rows: visibleRows, error: null };
    }
    const validated = validatedFilterRef.current;
    if (
      validated?.rows === visibleRows &&
      validated.filters === settings.filters
    ) {
      return { rows: validated.result, error: null };
    }
    try {
      return { rows: filterRows(visibleRows, settings.filters), error: null };
    } catch (e) {
      if (e instanceof InvalidFilterError) {
        return { rows: visibleRows, error: e.message };
      }
      throw e;
    }
  }, [visibleRows, settings.filters]);

  const sorted = useMemo(() => {
    const { sort } = settings;
    const type = columns.find((c) => c.name === sort?.column)?.type;
    return sort && type ? sortRows(filtered.rows, sort, type) : filtered.rows;
  }, [filtered.rows, settings.sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  // ピボット（集計とグラフで同じ結果を使う）
  const pivotResult = useMemo(
    () => pivot(sorted, settings.pivot, typeOf),
    [sorted, settings.pivot, typeOf],
  );

  const changeSettings = (patch) => {
    setNotice(null);
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  /** 列見出しのメニューの自由入力。通れば true、だめなら理由の文言を返す（メニューの中に出す） */
  const addCondition = (filter) => {
    const next = [...settings.filters, filter];
    try {
      // 25 万行では 1 回 0.1〜0.3 秒かかるので、検証で計算した結果を表示にも使う（2 回計算しない）
      validatedFilterRef.current = {
        rows: visibleRows,
        filters: next,
        result: filterRows(visibleRows, next),
      };
    } catch (e) {
      if (!(e instanceof InvalidFilterError)) throw e;
      return `条件を追加できません: ${e.message}`;
    }
    changeSettings({ filters: next });
    return true;
  };

  /** ドラッグ・「＋」・× による枠の操作（ピボットの行・列・値、散布図の X/Y） */
  const moveField = (move) => {
    const scatter = settings.chart?.scatter ?? null;
    const next = applyFieldMove(
      { pivot: settings.pivot, scatter },
      move,
      typeOf,
    );
    const patch = { pivot: next.pivot };
    if (next.scatter !== scatter) {
      patch.chart = {
        type: settings.chart?.type ?? "bar",
        scatter: next.scatter,
      };
    }
    changeSettings(patch);
  };

  // ---- データセットの操作（作成者のみ） ----
  const updateDataset = async (patch, failure) => {
    try {
      const updated = await datasetRepositoryRef.current.update(id, patch);
      setLoad((prev) => ({
        ...prev,
        dataset: { ...prev.dataset, ...updated },
      }));
      setNotice(null);
      onDatasetsChanged?.();
    } catch (e) {
      setNotice(`${failure}: ${e.message}`);
    }
  };

  const deleteDataset = async () => {
    const name = load.dataset.name;
    if (
      !window.confirm(
        `「${name}」を削除しますか？ 保存したビューも消え、元に戻せません。`,
      )
    ) {
      return;
    }
    try {
      await datasetRepositoryRef.current.remove(id);
    } catch (e) {
      setNotice(`削除できませんでした: ${e.message}`);
      return;
    }
    onDatasetsChanged?.();
    navigate("/");
  };

  // ---- ビュー ----
  // 保存する config は今の設定そのもの（新しい形）
  const currentConfig = settings;

  const selectView = (viewId) => {
    setSelectedViewId(viewId);
    setViewWarning(null);
    const view = views.find((v) => v.id === viewId);
    if (!view) return;
    const { config, disabled, notes } = sanitizeConfig(
      view.config,
      columnNames,
      rows.length,
    );
    setNotice(null);
    validatedFilterRef.current = null;
    setSettings(config);
    const messages = [
      ...(disabled.length > 0
        ? [
            `ビューの設定に、このデータにない列があったため無効にしました: ${disabled.join("、")}`,
          ]
        : []),
      ...notes,
    ];
    if (messages.length > 0) setViewWarning(messages.join(" "));
  };

  const submitView = async (name) => {
    try {
      if (dialog.mode === "edit") {
        const updated = await viewRepositoryRef.current.update(dialog.view.id, {
          name,
          config: currentConfig,
        });
        setViews((list) =>
          list.map((v) => (v.id === updated.id ? updated : v)),
        );
      } else {
        const created = await viewRepositoryRef.current.create({
          datasetId: id,
          name,
          config: currentConfig,
        });
        setViews((list) => [...list, created]);
        setSelectedViewId(created.id);
      }
      setDialog(null);
      setDialogError(null);
    } catch (e) {
      setDialogError(`ビューを保存できませんでした: ${e.message}`);
    }
  };

  const deleteView = async (view) => {
    if (!window.confirm(`ビュー「${view.name}」を削除しますか？`)) return;
    try {
      await viewRepositoryRef.current.remove(view.id);
    } catch (e) {
      setNotice(`ビューを削除できませんでした: ${e.message}`);
      return;
    }
    setViews((list) => list.filter((v) => v.id !== view.id));
    setSelectedViewId((current) => (current === view.id ? null : current));
  };

  // ---- 表示 ----
  if (load.status === "loading") {
    return <p role="status">読み込んでいます…</p>;
  }
  if (load.status === "notfound") {
    return (
      <section className="card">
        <h1 className="section-title">見つかりません</h1>
        <p className="muted">
          このデータは存在しないか、見る権限がありません。
        </p>
        <Link to="/">データ一覧に戻る</Link>
      </section>
    );
  }
  if (load.status === "error") {
    return (
      <div role="alert" className="alert">
        <p>データを読み込めませんでした。</p>
        <button
          type="button"
          className="btn"
          onClick={() => setAttempt((n) => n + 1)}
        >
          再試行
        </button>
      </div>
    );
  }

  const { dataset } = load;
  const alertMessage =
    notice ??
    (filtered.error
      ? `絞り込み条件が正しくないため、絞り込まずに全件を表示しています: ${filtered.error}`
      : null);

  return (
    <div className="detail">
      <Link to="/" className="back-link">
        ← データ一覧に戻る
      </Link>
      {location.state?.justUploaded && <UploadNotice />}

      <DatasetHeader
        dataset={dataset}
        ownerName={ownerNames[dataset.ownerId] ?? "不明なユーザー"}
        rowCount={rows.length}
        columnCount={columns.length}
        encoding={load.encoding}
        isOwner={dataset.ownerId === currentUser.id}
        onVisibilityChange={(visibility) =>
          updateDataset({ visibility }, "公開範囲を変更できませんでした")
        }
        onRename={(name) =>
          updateDataset({ name }, "名前を変更できませんでした")
        }
        onDelete={deleteDataset}
      >
        <SavedViewSelect
          views={views}
          currentUserId={currentUser.id}
          selectedId={selectedViewId}
          onSelect={selectView}
          onEdit={(view) => {
            setDialogError(null);
            setDialog({ mode: "edit", view });
          }}
          onDelete={deleteView}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDialogError(null);
            setDialog({ mode: "create" });
          }}
        >
          ビューを保存
        </button>
      </DatasetHeader>

      {alertMessage && (
        <p role="alert" className="alert">
          {alertMessage}
        </p>
      )}
      {viewWarning && (
        <p role="status" className="warning">
          {viewWarning}
        </p>
      )}

      <FilterBar
        filters={settings.filters}
        hiddenRowCount={settings.hiddenRows.length}
        hiddenColumns={settings.hiddenColumns}
        onRemoveFilter={(index) =>
          changeSettings({
            filters: settings.filters.filter((_, i) => i !== index),
          })
        }
        onShowAllRows={() => changeSettings({ hiddenRows: [] })}
        onShowColumn={(name) =>
          changeSettings({
            hiddenColumns: settings.hiddenColumns.filter((c) => c !== name),
          })
        }
        onClearAll={() =>
          changeSettings({ filters: [], hiddenRows: [], hiddenColumns: [] })
        }
      />

      <FieldDndProvider onMove={moveField}>
        <div className="analysis-grid">
          <div className="analysis-grid__table">
            <CollapsibleSection title="データ表">
              <AnalysisTable
                columns={columns}
                rows={sorted}
                baseRows={visibleRows}
                rowIndexOf={(row) => rowIndex.get(row)}
                settings={settings}
                onSettingsChange={changeSettings}
                onAddCondition={addCondition}
                renderLabel={(column) => (
                  <DraggableField field={column.name} surface="table">
                    {column.name}
                  </DraggableField>
                )}
              />
            </CollapsibleSection>
          </div>
          <div className="analysis-grid__chart">
            <CollapsibleSection title="グラフ">
              <ChartBuilder
                columns={columns}
                chart={settings.chart}
                pivot={settings.pivot}
                result={pivotResult}
                filteredRows={filtered.rows}
                onChartChange={(chart) => changeSettings({ chart })}
                onMove={moveField}
                onPivotChange={(next) => changeSettings({ pivot: next })}
              />
            </CollapsibleSection>
          </div>
          <div className="analysis-grid__pivot">
            <CollapsibleSection title="集計">
              <PivotPanel
                columns={columns}
                pivot={settings.pivot}
                result={pivotResult}
                onMove={moveField}
                onPivotChange={(next) => changeSettings({ pivot: next })}
              />
            </CollapsibleSection>
          </div>
        </div>
      </FieldDndProvider>

      {/* 閉じているあいだは統計・相関を計算しない（25 万行で約 0.4 秒かかるため） */}
      <CollapsibleSection title="統計・相関" defaultOpen={false} lazy>
        {/* 統計・相関は行の並びに依存しないので、並べ替え前（フィルタ後）の行を渡す（並べ替えで 25 万行を計算し直さない） */}
        <StatsPanel
          columns={columns}
          rows={filtered.rows}
          helpTerm={helpTerm}
          onHelpTermChange={setHelpTerm}
        />
        <CorrelationMatrix
          columns={columns}
          rows={filtered.rows}
          helpTerm={helpTerm}
          onHelpTermChange={setHelpTerm}
        />
      </CollapsibleSection>

      {dialog && (
        <SaveViewDialog
          mode={dialog.mode}
          initialName={dialog.mode === "edit" ? dialog.view.name : ""}
          config={currentConfig}
          columnNames={columnNames}
          submitError={dialogError}
          onSubmit={submitView}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export default DatasetDetailPage;
