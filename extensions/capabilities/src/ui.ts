import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
  stripTerminalSequences,
  type EditorComponent,
} from "@earendil-works/pi-tui";
import {
  BelowEditorNavigationEditor,
  BelowEditorStripState,
} from "../../shared/below-editor-navigation.ts";
import {
  capabilityNameMentions,
  capabilitiesRequestedByPrompt,
} from "../../shared/capability-intent.ts";

const FOREGROUND_RESET = "\u001b[39m";

interface CapabilityKeywordColorOptions {
  readonly colorMode: "truecolor" | "256color";
  readonly light: boolean;
}

type Rgb = readonly [number, number, number];

const DARK_SHIMMER_PALETTE: readonly Rgb[] = [
  [210, 168, 255],
  [239, 220, 255],
  [178, 125, 244],
  [210, 168, 255],
];
const LIGHT_SHIMMER_PALETTE: readonly Rgb[] = [
  [130, 80, 223],
  [92, 42, 174],
  [161, 111, 239],
  [130, 80, 223],
];

export function isLightNamedTheme(name: string | undefined) {
  return name !== undefined && /(?:^|[-_])light(?:$|[-_])/iu.test(name);
}

/**
 * Claude-style lavender keyword color. The light variant preserves readable
 * contrast instead of mechanically reusing the bright dark-terminal swatch.
 */
export function colorCapabilityKeyword(
  text: string,
  options: CapabilityKeywordColorOptions,
  phase?: number,
) {
  const start = options.light
    ? options.colorMode === "truecolor"
      ? "\u001b[38;2;130;80;223m"
      : "\u001b[38;5;98m"
    : options.colorMode === "truecolor"
      ? "\u001b[38;2;210;168;255m"
      : "\u001b[38;5;183m";
  if (phase === undefined || options.colorMode !== "truecolor") {
    return `${start}${text}${FOREGROUND_RESET}`;
  }

  const palette = options.light ? LIGHT_SHIMMER_PALETTE : DARK_SHIMMER_PALETTE;
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  const normalized = ((phase % 1) + 1) % 1;
  const sample = (position: number) => {
    const scaled = ((((position + normalized) % 1) + 1) % 1) * palette.length;
    const index = Math.floor(scaled);
    const amount = scaled - index;
    const from = palette[index]!;
    const to = palette[(index + 1) % palette.length]!;
    return [
      Math.round(from[0] + (to[0] - from[0]) * amount),
      Math.round(from[1] + (to[1] - from[1]) * amount),
      Math.round(from[2] + (to[2] - from[2]) * amount),
    ];
  };
  return (
    chars
      .map((character, index) => {
        const [red, green, blue] = sample(index / span);
        return `\u001b[38;2;${red};${green};${blue}m${character}`;
      })
      .join("") + FOREGROUND_RESET
  );
}

export function highlightCapabilityNames(
  line: string,
  capabilities: readonly string[],
  highlight: (text: string) => string,
) {
  const plain = stripTerminalSequences(line);
  const mentions = capabilityNameMentions(plain).filter((mention) =>
    capabilities.includes(mention.capability),
  );
  if (!mentions.length) return line;
  // Native editor SGR and cursor markers may sit inside a name. Preserve them
  // verbatim and color only the visible text pieces, never terminal bytes.
  const parts = line.split(/(\u001b\[[0-9;]*m|\u001b_pi:c\u0007)/u);
  if (parts.filter((_, index) => index % 2 === 0).join("") !== plain)
    return line;
  let offset = 0;
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      let result = "";
      let cursor = 0;
      for (const mention of mentions) {
        const start = Math.max(mention.start - offset, 0);
        const end = Math.min(mention.end - offset, part.length);
        if (start >= end) continue;
        result += part.slice(cursor, start) + highlight(part.slice(start, end));
        cursor = end;
      }
      offset += part.length;
      return result + part.slice(cursor);
    })
    .join("");
}

/**
 * Transparent, pre-submit feedback for capability discovery. It colours only
 * names whose capability the shared classifier would load after submission;
 * it never changes editor text, Session history, or model context.
 */
export class CapabilityIntentHighlightEditor extends BelowEditorNavigationEditor {
  private readonly highlight: (text: string) => string;
  private readonly onShimmerActive?: (active: boolean) => void;

  constructor(
    base: EditorComponent,
    keybindings: KeybindingsManager,
    highlight: (text: string) => string,
    onShimmerActive?: (active: boolean) => void,
  ) {
    super(
      base,
      keybindings,
      new BelowEditorStripState(),
      () => false,
      () => undefined,
      () => undefined,
    );
    this.highlight = highlight;
    this.onShimmerActive = onShimmerActive;
  }

  override render(width: number) {
    const capabilities = capabilitiesRequestedByPrompt(this.getText());
    const active =
      capabilities.includes("delegate") || capabilities.includes("workflow");
    this.onShimmerActive?.(active);
    if (!active) {
      return super.render(width);
    }
    return super
      .render(width)
      .map((line) =>
        highlightCapabilityNames(line, capabilities, this.highlight),
      );
  }
}
