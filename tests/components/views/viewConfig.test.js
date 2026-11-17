// @vitest-environment node
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 9 章
import { describe, it, expect } from "vitest";
import {
  EMPTY_CONFIG,
  migrateConfig,
  sanitizeConfig,
  findMissingColumns,
} from "../../../src/components/views/viewConfig.js";

const COLUMNS = ["店舗", "商品", "数量", "売上", "日付"];

const NEW_CONFIG = {
  filters: [
    { column: "店舗", op: "notIn", values: ["東京"] },
    { column: "売上", op: "gte", value: "100" },
  ],
  sort: { column: "売上", direction: "desc" },
  hiddenRows: [1, 3],
  hiddenColumns: ["日付"],
  pivot: {
    rows: ["店舗"],
    columns: ["商品"],
    values: [{ column: "売上", fn: "sum" }],
  },
  chart: { type: "bar", scatter: { x: "数量", y: "売上" } },
};

describe("EMPTY_CONFIG", () => {
  it("新しい形の空の設定", () => {
    expect(EMPTY_CONFIG).toEqual({
      filters: [],
      sort: null,
      hiddenRows: [],
      hiddenColumns: [],
      pivot: null,
      chart: null,
    });
  });
});

describe("migrateConfig: 古い形の変換", () => {
  it("aggregation は pivot（rows=groupBy, columns=[], values=metrics）になる", () => {
    const { config } = migrateConfig({
      filters: [],
      sort: null,
      aggregation: { groupBy: ["店舗"], metrics: [{ fn: "count" }] },
      chart: null,
    });
    expect(config.pivot).toEqual({
      rows: ["店舗"],
      columns: [],
      values: [{ fn: "count" }],
    });
    expect(config).not.toHaveProperty("aggregation");
  });

  it("散布図の chart は chart.scatter になる", () => {
    const { config } = migrateConfig({
      chart: { type: "scatter", x: "数量", y: "売上" },
    });
    expect(config.chart).toEqual({
      type: "scatter",
      scatter: { x: "数量", y: "売上" },
    });
  });

  it("集計ありの棒グラフは x/y を捨て、notes は空", () => {
    const { config, notes } = migrateConfig({
      aggregation: {
        groupBy: ["店舗"],
        metrics: [{ column: "売上", fn: "sum" }],
      },
      chart: { type: "bar", x: "店舗", y: "売上_sum" },
    });
    expect(config.chart).toEqual({ type: "bar", scatter: null });
    expect(notes).toEqual([]);
  });

  it("集計なしの棒グラフは pivot に変換し、notes で知らせる", () => {
    const { config, notes } = migrateConfig({
      aggregation: null,
      chart: { type: "line", x: "店舗", y: "売上" },
    });
    expect(config.pivot).toEqual({
      rows: ["店舗"],
      columns: [],
      values: [{ column: "売上", fn: "sum" }],
    });
    expect(config.chart).toEqual({ type: "line", scatter: null });
    expect(notes).toEqual([
      "グラフの設定を集計（行＝店舗、値＝売上の合計）に変換しました",
    ]);
  });

  it("集計なしで軸が片方だけのグラフは、集計にせず種類だけ残す", () => {
    const { config, notes } = migrateConfig({
      chart: { type: "bar", x: "店舗", y: "" },
    });
    expect(config.pivot).toBeNull();
    expect(config.chart).toEqual({ type: "bar", scatter: null });
    expect(notes).toEqual([]);
  });

  it("hiddenRows / hiddenColumns が無ければ []", () => {
    const { config } = migrateConfig({ filters: [], sort: null });
    expect(config.hiddenRows).toEqual([]);
    expect(config.hiddenColumns).toEqual([]);
  });

  it("新しい形はそのまま通る", () => {
    expect(migrateConfig(NEW_CONFIG)).toEqual({
      config: NEW_CONFIG,
      notes: [],
    });
  });
});

describe("sanitizeConfig", () => {
  it("新しい形でデータに全部ある設定は、そのまま通る", () => {
    expect(sanitizeConfig(NEW_CONFIG, COLUMNS, 5)).toEqual({
      config: NEW_CONFIG,
      disabled: [],
      notes: [],
    });
  });

  it("hiddenRows のうち rowCount 以上は捨て、disabled には出さない", () => {
    const { config, disabled } = sanitizeConfig(
      { ...NEW_CONFIG, hiddenRows: [0, 4, 5, 99] },
      COLUMNS,
      5,
    );
    expect(config.hiddenRows).toEqual([0, 4]);
    expect(disabled).toEqual([]);
  });

  it("データにない列（pivot・hiddenColumns・scatter）は無効にして disabled に出す", () => {
    const { config, disabled } = sanitizeConfig(
      {
        ...NEW_CONFIG,
        hiddenColumns: ["日付", "単価"],
        pivot: {
          rows: ["地域"],
          columns: ["商品", "色"],
          values: [{ column: "原価", fn: "sum" }, { fn: "count" }],
        },
        chart: { type: "scatter", scatter: { x: "重さ", y: "売上" } },
      },
      COLUMNS,
      5,
    );
    expect(config.hiddenColumns).toEqual(["日付"]);
    expect(config.pivot).toEqual({
      rows: [],
      columns: ["商品"],
      values: [{ fn: "count" }],
    });
    expect(config.chart.scatter).toEqual({ x: "", y: "売上" });
    expect(disabled).toEqual([
      "非表示の列（単価）",
      "集計の行（地域）",
      "集計の列（色）",
      "集計の値（原価）",
      "散布図の軸（重さ）",
    ]);
  });

  it("pivot の枠が全部無効になったら null", () => {
    const { config } = sanitizeConfig(
      { pivot: { rows: ["地域"], columns: [], values: [] } },
      COLUMNS,
      5,
    );
    expect(config.pivot).toBeNull();
  });

  it("絞り込み条件・並べ替えの無効化は今までどおり", () => {
    const { config, disabled } = sanitizeConfig(
      {
        filters: [{ column: "地域", op: "in", values: ["東"] }],
        sort: { column: "地域", direction: "asc" },
      },
      COLUMNS,
      5,
    );
    expect(config.filters).toEqual([]);
    expect(config.sort).toBeNull();
    expect(disabled).toEqual(["絞り込み条件（地域）", "並べ替え（地域）"]);
  });

  describe("形の検証（共有されたビューは他人が保存した値。壊れていても画面を落とさない）", () => {
    const BROKEN_NOTE =
      "ビューの設定に読み込めない部分があったため、その部分を無効にしました";

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["文字列", "abc"],
      ["配列", []],
      ["数値", 1],
    ])("config が %s なら空の設定にし、notes で知らせる", (_, raw) => {
      expect(sanitizeConfig(raw, COLUMNS, 5)).toEqual({
        config: { ...EMPTY_CONFIG },
        disabled: [],
        notes: [BROKEN_NOTE],
      });
    });

    it("filters が配列でなければ [] にする", () => {
      const { config, notes } = sanitizeConfig({ filters: "店舗" }, COLUMNS, 5);
      expect(config.filters).toEqual([]);
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("形の正しくない絞り込み条件だけを捨て、正しいものは残す", () => {
      const good = [
        { column: "店舗", op: "in", values: ["東京"] },
        { column: "売上", op: "gte", value: "100" },
        { column: "商品", op: "contains", value: "りん" },
      ];
      const { config, disabled, notes } = sanitizeConfig(
        {
          filters: [
            null,
            "店舗",
            { column: 1, op: "eq", value: "x" },
            { column: "店舗", op: "like", value: "x" },
            { column: "店舗", op: "in", values: "東京" },
            { column: "店舗", op: "in", values: [1, 2] },
            { column: "売上", op: "gte", value: 100 },
            ...good,
          ],
        },
        COLUMNS,
        5,
      );
      expect(config.filters).toEqual(good);
      expect(disabled).toEqual([]);
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it.each([
      ["文字列", "売上"],
      ["列名が文字列でない", { column: 1, direction: "asc" }],
      ["向きが不正", { column: "売上", direction: "up" }],
    ])("sort の形が正しくない（%s）なら null", (_, sort) => {
      const { config, notes } = sanitizeConfig({ sort }, COLUMNS, 5);
      expect(config.sort).toBeNull();
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("hiddenRows・hiddenColumns が配列でなければ []、列名が文字列でない要素は捨てる", () => {
      const { config, notes } = sanitizeConfig(
        { hiddenRows: "1", hiddenColumns: ["日付", 3, null] },
        COLUMNS,
        5,
      );
      expect(config.hiddenRows).toEqual([]);
      expect(config.hiddenColumns).toEqual(["日付"]);
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("pivot が object でなければ null", () => {
      const { config, notes } = sanitizeConfig({ pivot: "店舗" }, COLUMNS, 5);
      expect(config.pivot).toBeNull();
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("pivot の枠が配列でない・要素の形が正しくないものは捨てる", () => {
      const { config, notes } = sanitizeConfig(
        {
          pivot: {
            rows: "店舗",
            columns: ["商品", 5],
            values: [
              { column: "売上", fn: "sum" },
              { column: "売上", fn: "median" },
              { column: 1, fn: "sum" },
              { fn: "sum" }, // count 以外は列が必要
              null,
              { fn: "count" },
            ],
          },
        },
        COLUMNS,
        5,
      );
      expect(config.pivot).toEqual({
        rows: [],
        columns: ["商品"],
        values: [{ column: "売上", fn: "sum" }, { fn: "count" }],
      });
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it.each([
      ["文字列", "bar"],
      ["種類が不明", { type: "radar", scatter: null }],
    ])("chart の形が正しくない（%s）なら null", (_, chart) => {
      const { config, notes } = sanitizeConfig({ chart }, COLUMNS, 5);
      expect(config.chart).toBeNull();
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("chart.scatter の形が正しくなければ scatter だけ null にする", () => {
      const { config, notes } = sanitizeConfig(
        { chart: { type: "scatter", scatter: { x: 1, y: "売上" } } },
        COLUMNS,
        5,
      );
      expect(config.chart).toEqual({ type: "scatter", scatter: null });
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("古い形の aggregation が壊れていても、例外を出さない", () => {
      const { config, notes } = sanitizeConfig(
        { aggregation: { groupBy: "店舗", metrics: 1 } },
        COLUMNS,
        5,
      );
      expect(config.pivot).toBeNull();
      expect(notes).toEqual([BROKEN_NOTE]);
    });

    it("知らせは何か所壊れていても 1 つだけ", () => {
      const { notes } = sanitizeConfig(
        { filters: 1, sort: 1, pivot: 1, chart: 1 },
        COLUMNS,
        5,
      );
      expect(notes).toEqual([BROKEN_NOTE]);
    });
  });

  it("古い形も変換してから検証し、notes を返す", () => {
    const { config, notes } = sanitizeConfig(
      { chart: { type: "bar", x: "店舗", y: "売上" } },
      COLUMNS,
      5,
    );
    expect(config.pivot.rows).toEqual(["店舗"]);
    expect(notes).toHaveLength(1);
  });
});

describe("findMissingColumns", () => {
  it("pivot の 3 枠・hiddenColumns・scatter も見る（重複なし）", () => {
    expect(
      findMissingColumns(
        {
          ...EMPTY_CONFIG,
          hiddenColumns: ["単価"],
          pivot: {
            rows: ["地域"],
            columns: ["地域"],
            values: [{ column: "原価", fn: "sum" }, { fn: "count" }],
          },
          chart: { type: "scatter", scatter: { x: "重さ", y: "" } },
        },
        COLUMNS,
      ),
    ).toEqual(["単価", "地域", "原価", "重さ"]);
  });

  it("全部あれば []", () => {
    expect(findMissingColumns(NEW_CONFIG, COLUMNS)).toEqual([]);
  });
});
