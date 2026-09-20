import React, { createContext, useContext, useState } from 'react';

interface StateFilterContextType {
  selectedState: string;
  setSelectedState: (state: string) => void;
}

const StateFilterContext = createContext<StateFilterContextType | undefined>(undefined);

export const StateFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedState, setSelectedState] = useState<string>("All");

  return (
    <StateFilterContext.Provider value={{ selectedState, setSelectedState }}>
      {children}
    </StateFilterContext.Provider>
  );
};

export const useStateFilter = () => {
  const context = useContext(StateFilterContext);
  if (!context) throw new Error("useStateFilter must be used within a StateFilterProvider");
  return context;
};
