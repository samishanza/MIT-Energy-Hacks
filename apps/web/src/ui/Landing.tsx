import type { ReactNode } from "react";
import { Icon } from "./icons";

// The first screen, before any site is open: the wordmark, one line on what the tool does, the
// address field, and the demo sites as rows. Every claim here is something the tool does now.

export const DEMO_SITES: { address: string; note: string }[] = [
  { address: "79 Lowland St, Holliston, MA 01746", note: "Engineered plan set on file" },
  { address: "299 Vassar St, Cambridge, MA 02139", note: "MIT · Planning Board utility plan and city permits on file" },
  { address: "71 McKeon Rd, Worcester, MA 01610", note: "City bid drawings on file" },
  { address: "76 East Worcester St, Worcester, MA 01604", note: "City bid drawings on file" },
  { address: "26 Albany St, Worcester, MA 01604", note: "City bid drawings on file" },
];

export function Landing({ form, onTry, disabled }: { form: ReactNode; onTry: (address: string) => void; disabled: boolean }) {
  return (
    <main className="landing">
      <section className="land-hero">
        <img className="land-logo" src="/insite-logo.png" alt="InSite" />
        <div className="land-row">
          <h1 className="land-title">
            Site data <b>without</b> the site visit.
          </h1>
          <p className="land-sub">
            Enter a commercial address. InSite maps the parcel, the buildings and the grid connection from public data, ties every value to its source, and flags what a
            person must confirm.
          </p>
        </div>
        {form}
        <div className="tries">
          <div className="tries__head">
            <span className="is-label">Try a site</span>
            <span className="is-caption">Massachusetts, real public data</span>
          </div>
          {DEMO_SITES.map((site, i) => (
            <button key={site.address} type="button" className="try" disabled={disabled} onClick={() => onTry(site.address)}>
              <span className="try__n">{String(i + 1).padStart(2, "0")}</span>
              <span className="try__a">{site.address.replace(/, MA \d{5}$/, "")}</span>
              <span className="try__t">{site.note}</span>
              <Icon name="arrow" small />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
