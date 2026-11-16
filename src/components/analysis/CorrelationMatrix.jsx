import { useMemo } from "react";
import { correlation } from "../../utils/correlation.js";
import { useHelpTerm } from "../../hooks/useHelpTerm.js";
import { HelpButton, HelpNote } from "./HelpButton.jsx";
import { GLOSSARY } from "./glossary.js";

const TERM = "相関";

/**
 * 相関行列: 数値列どうしのピアソン相関係数を、対称行列の表にする。
 * 見出しの横の「？」で解説を見出しの下に出す。定義できない組（分散 0 など）は「-」。
 * helpTerm / onHelpTermChange: StatsPanel と同じ（開いている用語を親が持つ）。
 */
export function CorrelationMatrix({
  columns,
  rows,
  helpTerm,
  onHelpTermChange,
}) {
  const help = useHelpTerm(helpTerm, onHelpTermChange);
  const numericColumns = useMemo(
    () => columns.filter((c) => c.type === "number"),
    [columns],
  );
  const matrix = useMemo(
    () =>
      correlation(numericColumns.map((c) => rows.map((row) => row[c.name]))),
    [numericColumns, rows],
  );

  return (
    <div className="correlation">
      <div className="subsection-header">
        <h3 className="subsection-title">相関行列</h3>
        <HelpButton
          term={TERM}
          expanded={help.current === TERM}
          onClick={() => help.toggle(TERM)}
        />
      </div>
      {help.current === TERM && (
        <HelpNote term={TERM} onClose={help.close}>
          {GLOSSARY[TERM]}
        </HelpNote>
      )}
      {numericColumns.length === 0 ? (
        <p className="muted">数値の列がないため、相関は出せません。</p>
      ) : (
        <div
          role="region"
          aria-label="相関行列の表"
          tabIndex={0}
          className="table-scroll"
        >
          <table className="table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">列</span>
                </th>
                {numericColumns.map((c) => (
                  <th key={c.name} scope="col" className="num">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numericColumns.map((rowColumn, i) => (
                <tr key={rowColumn.name}>
                  <th scope="row">{rowColumn.name}</th>
                  {numericColumns.map((c, j) => (
                    <td key={c.name} className="num">
                      {matrix[i][j] === null ? "-" : matrix[i][j].toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
