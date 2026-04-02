import { useFilter } from "../context/FilterContext";
import { useState } from "react";

const SidebarFilter = ({ data }) => {
  const { filters, updateFilter } = useFilter();
  const [searchText, setSearchText] = useState({});

  if (!data || data.length === 0) return null;

  const columns = Object.keys(data[0]);

  return (
    <div
      style={{
        width: "260px",
        padding: "20px",
        borderRight: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(10px)",
        background: "rgba(20,25,35,0.6)",
      }}
    >
      <h2 style={{ marginBottom: "20px" }}>🔎 Filters</h2>

      {columns.map((col) => {
        const values = data.map((d) => d[col]);
        const unique = [...new Set(values)];
        const isNumber = typeof unique[0] === "number";

        const filtered = unique.filter((val) =>
          String(val)
            .toLowerCase()
            .includes((searchText[col] || "").toLowerCase())
        );

        return (
          <div key={col} style={{ marginBottom: "20px" }}>
            <h4 style={{ marginBottom: "8px", opacity: 0.8 }}>{col}</h4>

            {!isNumber && (
              <input
                placeholder="Search..."
                value={searchText[col] || ""}
                onChange={(e) =>
                  setSearchText({ ...searchText, [col]: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "6px",
                  marginBottom: "8px",
                  borderRadius: "6px",
                  background: "#0d1117",
                  border: "1px solid #333",
                  color: "white",
                }}
              />
            )}

            {isNumber ? (
              (() => {
                const min = Math.min(...unique);
                const max = Math.max(...unique);

                return (
                  <>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      onChange={(e) =>
                        updateFilter(
                          col,
                          { min, max: Number(e.target.value) },
                          true
                        )
                      }
                      style={{ width: "100%" }}
                    />
                    <small style={{ opacity: 0.6 }}>
                      {min} → {max}
                    </small>
                  </>
                );
              })()
            ) : (
              filtered.slice(0, 15).map((val) => (
                <label
                  key={val}
                  style={{
                    display: "block",
                    fontSize: "14px",
                    marginBottom: "4px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={filters[col]?.includes(val) || false}
                    onChange={() => updateFilter(col, val)}
                  />{" "}
                  {String(val)}
                </label>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SidebarFilter;