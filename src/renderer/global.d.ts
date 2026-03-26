import type { ResearchGraphApi } from "../shared/api";

declare global {
  interface Window {
    researchGraph: ResearchGraphApi;
  }
}

export {};
