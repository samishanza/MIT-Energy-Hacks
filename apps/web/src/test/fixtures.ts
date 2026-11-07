import {
  ReadinessReportSchema,
  RecordVersionSchema,
  type ReadinessReport,
  type RecordVersion,
} from "@eqore/contract";
import readinessSample from "@eqore/contract/samples/readiness.sample.json";
import recordSample from "@eqore/contract/samples/record.sample.json";
import worcesterReadiness from "../mock/worcester.readiness.json";
import worcesterRun from "../mock/worcester.record.json";

// Fresh copies, so a test can change one without affecting another.
export const sampleRecord = (): RecordVersion => RecordVersionSchema.parse(structuredClone(recordSample));
export const sampleReport = (): ReadinessReport => ReadinessReportSchema.parse(structuredClone(readinessSample));

// A run of 100 Research Dr, Worcester, recorded from real public sources.
export const worcesterRecord = (): RecordVersion => RecordVersionSchema.parse(structuredClone(worcesterRun));
export const worcesterReport = (): ReadinessReport => ReadinessReportSchema.parse(structuredClone(worcesterReadiness));
