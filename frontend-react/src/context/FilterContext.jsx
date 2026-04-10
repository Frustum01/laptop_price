import React, { createContext, useContext, useState } from "react";

const FilterContext = createContext();

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState({});

  // ✅ TOGGLE FILTER (MULTI SELECT)
  const setSingleFilter = (key, value) => {
    setFilters((prev) => {
      const existing = prev[key] || [];
      const arr = Array.isArray(existing) ? existing : [existing];

      if (arr.includes(value)) {
        const updated = arr.filter((v) => v !== value);

        if (updated.length === 0) {
          const newFilters = { ...prev };
          delete newFilters[key];
          return newFilters;
        }

        return { ...prev, [key]: updated };
      } else {
        return { ...prev, [key]: [...arr, value] };
      }
    });
  };

  const clearFilter = (key) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  };

  return (
    <FilterContext.Provider value={{ filters, setSingleFilter, clearFilter }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => useContext(FilterContext);
