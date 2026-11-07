// @vitest-environment jsdom
import { DOORS_CLOSED_SAFETY_TEXT, type CaptureRequest } from "@eqore/contract";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureApiError, type CaptureApi } from "./captureApi";
import { CapturePage } from "./CapturePage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const request = (overrides: Partial<CaptureRequest> = {}): CaptureRequest => ({
  field: "main_device_rating",
  label: "Main device rating",
  question: "Please photograph the label on the main switchboard.",
  accepts: "photo",
  safetyText: DOORS_CLOSED_SAFETY_TEXT,
  aerial: null,
  pin: null,
  synthetic: true,
  ...overrides,
});

const result = { evidenceFileId: "file-1", state: "inferred", positionStatus: "placed" } as const;

function fakeApi(overrides: Partial<CaptureApi> = {}): CaptureApi {
  return {
    read: vi.fn().mockResolvedValue(request()),
    submit: vi.fn().mockResolvedValue(result),
    ...overrides,
  };
}

function stubLocation(behavior: "granted" | "denied" | "silent") {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    if (behavior === "granted") {
      ok({ coords: { latitude: 42.26, longitude: -71.8, accuracy: 8 } } as GeolocationPosition);
    } else if (behavior === "denied") {
      fail({ code: 1, message: "denied" } as GeolocationPositionError);
    }
  });
  vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

const photo = new File(["photo-bytes"], "label.jpg", { type: "image/jpeg" });

async function chooseFile(file = photo) {
  const input = (await screen.findByLabelText(/Take a photo|Choose your bill/)) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

async function reachCapture() {
  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
}

describe("capture prompt", () => {
  it.each(["photo", "bill"] as const)("shows the contract's safety text on a %s prompt", async (accepts) => {
    render(<CapturePage token="t" api={fakeApi({ read: vi.fn().mockResolvedValue(request({ accepts })) })} />);
    expect((await screen.findByRole("note", { name: "Safety" })).textContent).toContain(DOORS_CLOSED_SAFETY_TEXT);
    expect(screen.getByText(/Prototype\. Safety wording not yet reviewed/)).toBeTruthy();
  });

  it("keeps the safety text in view at the capture step", async () => {
    render(<CapturePage token="t" api={fakeApi()} />);
    await reachCapture();
    expect(screen.getByRole("note", { name: "Safety" })).toBeTruthy();
  });

  it("asks a photo prompt to use the camera", async () => {
    render(<CapturePage token="t" api={fakeApi()} />);
    await reachCapture();
    const input = screen.getByLabelText("Take a photo") as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.accept).toBe("image/jpeg,image/png");
  });

  it("lets a bill prompt pick a PDF", async () => {
    render(<CapturePage token="t" api={fakeApi({ read: vi.fn().mockResolvedValue(request({ accepts: "bill" })) })} />);
    await reachCapture();
    const input = screen.getByLabelText("Choose your bill") as HTMLInputElement;
    expect(input.getAttribute("capture")).toBeNull();
    expect(input.accept).toContain("application/pdf");
  });

  it("offers a way out when the label can't be seen, with no photo", async () => {
    const api = fakeApi();
    render(<CapturePage token="t" api={api} />);
    await reachCapture();
    fireEvent.click(screen.getByRole("button", { name: "I can't see this without opening anything" }));
    expect(screen.getByText(/Please don't open anything/)).toBeTruthy();
    expect(api.submit).not.toHaveBeenCalled();
  });
});

describe("bill prompts", () => {
  it("has no equipment exit, since a bill isn't inside anything", async () => {
    render(<CapturePage token="t" api={fakeApi({ read: vi.fn().mockResolvedValue(request({ accepts: "bill" })) })} />);
    await reachCapture();
    expect(screen.queryByRole("button", { name: /can't see this/ })).toBeNull();
  });
});

describe("location", () => {
  it("sends position as form fields when it's shared", async () => {
    stubLocation("granted");
    const api = fakeApi();
    render(<CapturePage token="t" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Share location" }));
    await chooseFile();
    fireEvent.click(await screen.findByRole("button", { name: "Use this photo" }));
    await waitFor(() => expect(api.submit).toHaveBeenCalled());
    expect(api.submit).toHaveBeenCalledWith("t", photo, { latitude: 42.26, longitude: -71.8, accuracyMeters: 8 });
  });

  it("still allows sending after a denied permission", async () => {
    stubLocation("denied");
    const api = fakeApi();
    render(<CapturePage token="t" api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Share location" }));
    expect(await screen.findByText(/You can still send the photo/)).toBeTruthy();
    await chooseFile();
    fireEvent.click(await screen.findByRole("button", { name: "Use this photo" }));
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith("t", photo, {}));
  });
});

describe("sending", () => {
  async function send(api: CaptureApi) {
    render(<CapturePage token="t" api={api} />);
    await reachCapture();
    await chooseFile();
    fireEvent.click(await screen.findByRole("button", { name: "Use this photo" }));
  }

  it("says nothing is verified yet, and never shows a reading", async () => {
    await send(fakeApi());
    expect(await screen.findByText(/Nothing is verified yet/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/inferred|draft/i);
  });

  it("keeps the photo for retry when an upload fails", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new CaptureApiError("network", "no signal")).mockResolvedValue(result);
    await send(fakeApi({ submit }));
    expect(await screen.findByText(/Not sent\. Try again/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]![1]).toBe(photo);
    expect(await screen.findByText(/Nothing is verified yet/)).toBeTruthy();
  });

  it.each([
    ["file_too_large", "That file is too large."],
    ["file_type", "Only JPEG, PNG, or PDF files can be sent."],
  ])("explains a rejected file: %s", async (code, message) => {
    await send(fakeApi({ submit: vi.fn().mockRejectedValue(new CaptureApiError(code, message)) }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("explains an upload limit reached mid-request", async () => {
    await send(fakeApi({ submit: vi.fn().mockRejectedValue(new CaptureApiError("upload_limit", "limit")) }));
    expect(await screen.findByText(/reached its upload limit/)).toBeTruthy();
  });
});

describe("links that can't be used", () => {
  const rejecting = (code: string) => fakeApi({ read: vi.fn().mockRejectedValue(new CaptureApiError(code, "server words")) });

  it.each(["invalid_token", "token_expired"])("shows an inactive link for %s, with no site data", async (code) => {
    render(<CapturePage token="t" api={rejecting(code)} />);
    expect(await screen.findByText(/This link isn't active/)).toBeTruthy();
    expect(screen.queryByRole("note", { name: "Safety" })).toBeNull();
  });

  it("says it has what it needs when the field is already verified", async () => {
    render(<CapturePage token="t" api={rejecting("token_closed")} />);
    expect(await screen.findByText(/We have what we need/)).toBeTruthy();
  });

  it("offers another try when the request couldn't load", async () => {
    const read = vi.fn().mockRejectedValueOnce(new CaptureApiError("network", "no signal")).mockResolvedValue(request());
    render(<CapturePage token="t" api={fakeApi({ read })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("note", { name: "Safety" })).toBeTruthy();
    expect(screen.queryByText(/This link isn't active/)).toBeNull();
  });
});

describe("aerial", () => {
  it("shows the requested spot with one pin", async () => {
    const aerial = {
      tileUrlTemplate: "https://tiles.example/{z}/{y}/{x}",
      attribution: "Sample imagery",
      sourceId: "sample",
      sourceDate: null,
      maxZoom: 20,
      center: [-71.8, 42.26] as [number, number],
      zoom: 18,
    };
    const { container } = render(
      <CapturePage
        token="t"
        api={fakeApi({ read: vi.fn().mockResolvedValue(request({ aerial, pin: [-71.8, 42.26] })) })}
      />,
    );
    await screen.findByRole("note", { name: "Safety" });
    const tiles = container.querySelectorAll<HTMLImageElement>(".aerial img");
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0]!.src).toMatch(/^https:\/\/tiles\.example\/18\/\d+\/\d+$/);
    expect(container.querySelectorAll(".aerial-pin")).toHaveLength(1);
    expect(screen.getByText("Sample imagery")).toBeTruthy();
  });
});
