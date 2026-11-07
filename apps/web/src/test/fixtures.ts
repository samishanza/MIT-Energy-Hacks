import {
  ReadinessReportSchema,
  RecordVersionSchema,
  type ReadinessReport,
  type RecordVersion,
} from "@eqore/contract";
import readinessSample from "@eqore/contract/samples/readiness.sample.json";
import recordSample from "@eqore/contract/samples/record.sample.json";

// Fresh copies, so a test can change one without affecting another.
export const sampleRecord = (): RecordVersion => RecordVersionSchema.parse(structuredClone(recordSample));
export const sampleReport = (): ReadinessReport => ReadinessReportSchema.parse(structuredClone(readinessSample));
