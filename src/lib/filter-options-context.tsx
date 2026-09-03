import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface FilterOptions {
  // CRM
  sectors: string[];
  primes: string[];
  areasOfInterest: string[];
  // Targeting
  targetSectors: string[];
  targetCities: string[];
  targetOrigins: string[];
  targetCampaigns: string[];
  targetEvents: string[];
  /** How many targets sit under each event name (0 for unused catalog events). */
  targetEventCounts: Record<string, number>;

  // Portfolio
  portfolioDomains: string[];
  portfolioSectors: string[];
  portfolioCities: string[];
  portfolioDtcPriorities: string[];
  portfolioCompanyStages: string[];
  portfolioLeadInvestors: string[];
  // Dashboard (shared from CRM + targets)
  allCities: string[];
  portfolioCompanies: string[];
  /** Lead investor names for the dashboard investor drill-downs. */
  dashboardInvestors: string[];
}

const defaultOptions: FilterOptions = {
  sectors: [],
  primes: [],
  areasOfInterest: [],
  targetSectors: [],
  targetCities: [],
  targetOrigins: [],
  targetCampaigns: [],
  targetEvents: [],
  targetEventCounts: {},

  portfolioDomains: [],
  portfolioSectors: [],
  portfolioCities: [],
  portfolioDtcPriorities: [],
  portfolioCompanyStages: [],
  portfolioLeadInvestors: [],
  allCities: [],
  portfolioCompanies: [],
  dashboardInvestors: [],
};

interface FilterOptionsContextType {
  options: FilterOptions;
  updateOptions: (partial: Partial<FilterOptions>) => void;
}

const FilterOptionsContext = createContext<FilterOptionsContextType>({
  options: defaultOptions,
  updateOptions: () => {},
});

export function FilterOptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<FilterOptions>(defaultOptions);
  const updateOptions = useCallback((partial: Partial<FilterOptions>) => {
    setOptions((prev) => ({ ...prev, ...partial }));
  }, []);
  return (
    <FilterOptionsContext.Provider value={{ options, updateOptions }}>
      {children}
    </FilterOptionsContext.Provider>
  );
}

export function useFilterOptions() {
  return useContext(FilterOptionsContext);
}
