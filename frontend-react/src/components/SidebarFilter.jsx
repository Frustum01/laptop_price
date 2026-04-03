import React, { useState } from "react";
import { useFilter } from "../context/FilterContext";

const SidebarFilter = ({ data = [] }) => {
  const { filters, setSingleFilter } = useFilter();
  const [search, setSearch] = useState("");

  if (!data.length) return null;

  const keys = Object.keys(data[0]);

  const dateKey = keys.find((k) =>
    k.toLowerCase().includes("date")
  );

  const uniqueValues = (key) => [
    ...new Set(data.map((item) => item[key])),
  ];

  const dateValues = dateKey ? uniqueValues(dateKey) : [];

  const filteredDates = dateValues.filter((v) =>
    String(v).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ width: "260px", padding: "20px" }}>
      <h3>🔍 Filters</h3>

      {dateKey && (
        <>
          <h4>{dateKey}</h4>

          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", marginBottom: "10px" }}
          />

          {filteredDates.map((val, i) => {
            const selected = filters[dateKey] || [];

            return (
              <div key={i}>
                <input
                  type="checkbox"
                  checked={selected.includes(val)}
                  onChange={() =>
                    setSingleFilter(dateKey, String(val).trim())
                  }
                />
                <label style={{ marginLeft: "6px" }}>{val}</label>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default SidebarFilter;