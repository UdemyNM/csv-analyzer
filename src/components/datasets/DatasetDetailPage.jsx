import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "../../analysis.css";
import { useCsvAnalysis } from "../../hooks/useCsvAnalysis.js";
import { aggregate } from "../../utils/aggregate.js";
import { filterRows, InvalidFilterError } from "../../utils/filterRows.js";
import { sortRows } from "../../utils/sortRows.js";
import { AggregatePanel } from "../analysis/AggregatePanel.jsx";
import { CollapsibleSection } from "../analysis/CollapsibleSection.jsx";
import { CorrelationMatrix } from "../analysis/CorrelationMatrix.jsx";
import { DataTable } from "../analysis/DataTable.jsx";
import { FilterBar } from "../analysis/FilterBar.jsx";
import { StatsPanel } from "../analysis/StatsPanel.jsx";
import { metricOutputName } from "../analysis/aggregationNames.js";
import { ChartBuilder } from "../charts/ChartBuilder.jsx";
import { SaveViewDialog } from "../views/SaveViewDialog.jsx";
import { SavedViewSelect } from "../views/SavedViewSelect.jsx";
import { EMPTY_CONFIG, sanitizeConfig } from "../views/viewConfig.js";
import { DatasetHeader } from "./DatasetHeader.jsx";
import { UploadNotice } from "./UploadNotice.jsx";

const NO_ROWS = [];
const NO_COLUMNS = [];

/** 保存するグラフ設定の軸を、今の元データにある列（選択肢）に絞る。どちらも残らなければ null */
function narrowChart(chart, xOptions, yOptions) {
  if (!chart) return null;
  const x = xOptions.includes(chart.x) ? chart.x : "";
  const y = yOptions.includes(chart.y) ? chart.y : "";
  return x === "" && y === "" ? null : { type: chart.type, x, y };
}

const isNotFound = (e) => e?.name === "NotFoundError";

/**
 * データセット詳細（分析）画面 /datasets/:id（docs/03 7 章、docs/05）。
 * 設定（フィルタ・並べ替え・集計・グラフ）はこの画面が持ち、views.config と同じ形 { filters, sort, aggregation, chart } にする。
 * 全セクションは「フィルタ → 並べ替え」後の行を使う。
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
  // 条件の追加時に検証のため計算した絞り込み結果（同じ rows・同じ条件の配列なら、表示でも使い回す）
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

  // フィルタ。不正な条件（ビュー由来）があるときは、絞り込まず全件を使う
  const filtered = useMemo(() => {
    if (settings.filters.length === 0) return { rows, error: null };
    const validated = validatedFilterRef.current;
    if (validated?.rows === rows && validated.filters === settings.filters) {
      return { rows: validated.result, error: null };
    }
    try {
      return { rows: filterRows(rows, settings.filters), error: null };
    } catch (e) {
      if (e instanceof InvalidFilterError) return { rows, error: e.message };
      throw e;
    }
  }, [rows, settings.filters]);

  const sorted = useMemo(() => {
    const { sort } = settings;
    const type = columns.find((c) => c.name === sort?.column)?.type;
    return sort && type ? sortRows(filtered.rows, sort, type) : filtered.rows;
  }, [filtered.rows, settings.sort, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const aggregated = useMemo(
    () =>
      settings.aggregation ? aggregate(sorted, settings.aggregation) : null,
    [sorted, settings.aggregation],
  );

  // グラフの元データと軸の選択肢: 集計があるときは集計結果、ないときは絞り込み後の行
  const { chartRows, xOptions, yOptions } = useMemo(() => {
    if (settings.aggregation) {
      const outputs = settings.aggregation.metrics.map(metricOutputName);
      return {
        chartRows: aggregated,
        xOptions: [...settings.aggregation.groupBy, ...outputs],
        yOptions: outputs,
      };
    }
    return {
      chartRows: sorted,
      xOptions: columnNames,
      yOptions: columns.filter((c) => c.type === "number").map((c) => c.name),
    };
  }, [settings.aggregation, aggregated, sorted, columnNames, columns]);

  const changeSettings = (patch) => {
    setNotice(null);
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const addFilter = (filter) => {
    const next = [...settings.filters, filter];
    try {
      // 25 万行では 1 回 0.1〜0.3 秒かかるので、検証で計算した結果を表示にも使う（2 回計算しない）
      validatedFilterRef.current = {
        rows,
        filters: next,
        result: filterRows(rows, next),
      };
    } catch (e) {
      if (!(e instanceof InvalidFilterError)) throw e;
      setNotice(`条件を追加できません: ${e.message}`);
      return false;
    }
    changeSettings({ filters: next });
    return true;
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
  const currentConfig = useMemo(
    () => ({
      filters: settings.filters,
      sort: settings.sort,
      aggregation: settings.aggregation,
      chart: narrowChart(settings.chart, xOptions, yOptions),
    }),
    [settings, xOptions, yOptions],
  );

  const selectView = (viewId) => {
    setSelectedViewId(viewId);
    setViewWarning(null);
    const view = views.find((v) => v.id === viewId);
    if (!view) return;
    const { config, disabled } = sanitizeConfig(view.config, columnNames);
    setNotice(null);
    setSettings(config);
    if (disabled.length > 0) {
      setViewWarning(
        `ビューの設定に、このデータにない列があったため無効にしました: ${disabled.join("、")}`,
      );
    }
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
        columns={columns}
        filters={settings.filters}
        sort={settings.sort}
        onAddFilter={addFilter}
        onRemoveFilter={(index) =>
          changeSettings({
            filters: settings.filters.filter((_, i) => i !== index),
          })
        }
        onSortChange={(sort) => changeSettings({ sort })}
      />

      <CollapsibleSection title="データ表">
        <DataTable columns={columns} rows={sorted} />
      </CollapsibleSection>

      <CollapsibleSection title="グラフ">
        <ChartBuilder
          rows={chartRows}
          xOptions={xOptions}
          yOptions={yOptions}
          chart={settings.chart}
          onChartChange={(chart) => changeSettings({ chart })}
        />
      </CollapsibleSection>

      <CollapsibleSection title="集計">
        <AggregatePanel
          columns={columns}
          aggregation={settings.aggregation}
          resultRows={aggregated ?? NO_ROWS}
          onAggregationChange={(aggregation) => changeSettings({ aggregation })}
        />
      </CollapsibleSection>

      <CollapsibleSection title="統計・相関">
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
