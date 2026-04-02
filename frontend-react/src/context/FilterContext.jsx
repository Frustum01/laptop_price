import { createContext, useContext, useState } from "react";

const FilterContext = createContext();

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState({});

  const updateFilter = (column, value, isRange = false) => {
    setFilters((prev) => {
      let updated = { ...prev };

      if (isRange) {
        updated[column] = value;
      } else {
        const current = updated[column] || [];

        if (current.includes(value)) {
          updated[column] = current.filter((v) => v !== value);
        } else {
          updated[column] = [...current, value];
        }
      }

      return updated;
    });
  };

  const setSingleFilter = (column, value) => {
    setFilters((prev) => ({
      ...prev,
      [column]: [value],
    }));
  };

  const clearFilter = (column) => {
    setFilters((prev) => {
      const updated = { ...prev };
      delete updated[column];
      return updated;
    });
  };

  return (
    <FilterContext.Provider
      value={{ filters, updateFilter, setSingleFilter, clearFilter }}
    >
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => useContext(FilterContext);