import { useMemo } from "react";
import { statistics } from "../../utils/statistics.js";
import { useHelpTerm } from "../../hooks/useHelpTerm.js";
import { HelpButton, HelpNote } from "./HelpButton.jsx";
import { GLOSSARY } from "./glossary.js";
import { formatCell } from "./formatCell.js";

const COLUMNS = [
  ["件数", "count"],
  ["平均", "mean"],
  ["中央値", "median"],
  ["標準偏差", "stdDev"],
  ["最小", "min"],
  ["最大", "max"],
  ["欠損数", "missing"], // FR-25。「？」の対象（FR-27）には含まれないので解説は持たない
];

/**
 * 基本統計: 数値列ごとに 件数・平均・中央値・標準偏差・最小・最大・欠損数 を表にする。
 * 列見出しの横の「？」（解説のある用語だけ）で解説を表の下に出す（同時に 1 つ）。
 * helpTerm / onHelpTermChange を渡すと、開いている用語を親が持つ（相関行列と合わせて 1 つにするため）。
 */
export function StatsPanel({ columns, rows, helpTerm, onHelpTermChange }) {
  const help = useHelpTerm(helpTerm, onHelpTermChange);
  const numericColumns = useMemo(
    () => columns.filter((c) => c.type === "number"),
    [columns],
  );
  const stats = useMemo(
    () =>
      numericColumns.map((c) => ({
        name: c.name,
        result: statistics(rows.map((row) => row[c.name])),
      })),
    [numericColumns, rows],
  );

  if (numericColumns.length === 0) {
    return <p className="muted">数値の列がないため、基本統計は出せません。</p>;
  }

  const openTerm = COLUMNS.some(([term]) => term === help.current)
    ? help.current
    : null;

  return (
    <div className="stats">
      <h3 className="subsection-title">基本統計</h3>
      <div
        role="region"
        aria-label="基本統計の表"
        tabIndex={0}
        className="table-scroll"
      >
        <table className="table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">列</span>
              </th>
              {COLUMNS.map(([term]) => (
                <th key={term} scope="col" className="num">
                  <span className="th-with-help">
                    {term}
                    {term in GLOSSARY && (
                      <HelpButton
                        term={term}
                        expanded={help.current === term}
                        onClick={() => help.toggle(term)}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map(({ name, result }) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {COLUMNS.map(([term, key]) => (
                  <td key={term} className="num">
                    {formatCell(result[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openTerm && (
        <HelpNote term={openTerm} onClose={help.close}>
          {GLOSSARY[openTerm]}
        </HelpNote>
      )}
    </div>
  );
}
