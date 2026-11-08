import type { ObservedValue, RecordVersion } from "@eqore/contract";
import { useState, type FormEvent } from "react";
import type { EngineerApi } from "../api";

// The few electrical facts public data can't give. Each is recorded as a person's entry with
// its source, so the single line and calculations recompute from it and say where it came from.

const VOLTAGES = ["480Y/277 V, 3-phase, 4-wire", "208Y/120 V, 3-phase, 4-wire", "240/120 V, 1-phase", "480 V, 3-phase, 3-wire"];

export interface SpecsPrefill {
  service_voltage?: string | null;
  main_breaker_a?: number | null;
  bus_rating_a?: number | null;
  fault_current_a?: number | null;
  meter_number?: string | null;
  source?: string;
}

type Entry = { field: string; value: ObservedValue };

export function ElectricalSpecsForm({
  api,
  record,
  actorName,
  onActorName,
  onRecord,
  prefill,
}: {
  api: EngineerApi;
  record: RecordVersion;
  actorName: string;
  onActorName: (name: string) => void;
  onRecord: (next: RecordVersion) => void;
  prefill?: SpecsPrefill | null;
}) {
  const [open, setOpen] = useState(false);
  const [voltage, setVoltage] = useState("");
  const [main, setMain] = useState("");
  const [bus, setBus] = useState("");
  const [fault, setFault] = useState("");
  const [meter, setMeter] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fill = (p: SpecsPrefill) => {
    if (p.service_voltage) setVoltage(VOLTAGES.find((v) => v.startsWith(`${p.service_voltage} `)) ?? p.service_voltage);
    if (p.main_breaker_a) setMain(String(p.main_breaker_a));
    if (p.bus_rating_a) setBus(String(p.bus_rating_a));
    if (p.fault_current_a) setFault(String(p.fault_current_a));
    if (p.meter_number) setMeter(p.meter_number);
    if (p.source) setSource(p.source);
    setOpen(true);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amps = (text: string) => ({ type: "quantity" as const, value: Number(text), unit: "A" });
    const text = (t: string): ObservedValue => ({ type: "text", value: t });
    const candidates: (Entry | null)[] = [
      voltage ? { field: "service_voltage", value: text(voltage) } : null,
      main ? { field: "main_device_rating", value: amps(main) } : null,
      bus ? { field: "bus_rating", value: amps(bus) } : null,
      fault ? { field: "available_fault_current_a", value: amps(fault) } : null,
      meter ? { field: "meter_number", value: text(meter) } : null,
    ];
    const entries = candidates.filter((e): e is Entry => e !== null);
    if (entries.some((e) => e.value.type === "quantity" && !(e.value.value > 0))) return setError("Ratings need to be positive numbers of amps.");
    if (entries.length === 0) return setError("Enter at least one value.");
    setSaving(true);
    setError(null);
    try {
      let latest = record;
      for (const entry of entries) {
        latest = await api.correctValue(record.site.id, entry.field, {
          verifierName: actorName.trim(),
          evidence: [{ kind: "document", description: source.trim() }],
          value: entry.value,
        });
      }
      onRecord(latest);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Saving didn't work.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="specs" aria-label="Electrical specs">
      <div className="specs-head">
        <button type="button" className="primary" aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
          Add electrical specs
        </button>
        {prefill ? (
          <button type="button" onClick={() => fill(prefill)}>
            Fill from public document
          </button>
        ) : null}
        <span className="note">The few values public records don't give: from a panel nameplate photo, a permit, a drawing, or the utility.</span>
      </div>
      {open ? (
        <form className="specs-form" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Service voltage</span>
            <input list="voltages" value={voltage} onChange={(e) => setVoltage(e.target.value)} placeholder="480Y/277 V, 3-phase, 4-wire" />
            <datalist id="voltages">
              {VOLTAGES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Main breaker (A)</span>
            <input inputMode="numeric" value={main} onChange={(e) => setMain(e.target.value)} />
          </label>
          <label className="field">
            <span>Bus rating (A)</span>
            <input inputMode="numeric" value={bus} onChange={(e) => setBus(e.target.value)} />
          </label>
          <label className="field">
            <span>Available fault current (A)</span>
            <input inputMode="numeric" value={fault} onChange={(e) => setFault(e.target.value)} />
          </label>
          <label className="field">
            <span>Meter number</span>
            <input value={meter} onChange={(e) => setMeter(e.target.value)} />
          </label>
          <label className="field specs-source">
            <span>Where these came from</span>
            <input required value={source} onChange={(e) => setSource(e.target.value)} placeholder="Panel nameplate photo, permit number, or a link" />
          </label>
          <label className="field">
            <span>Your name</span>
            <input required value={actorName} onChange={(e) => onActorName(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save and redraw"}
          </button>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
