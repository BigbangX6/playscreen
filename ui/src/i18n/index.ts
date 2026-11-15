// Langue de l'interface : français (texte d'origine) ou anglais.
//
// Choisie à l'installation (pré-sélectionnée selon la langue du PC), gardée dans
// %LOCALAPPDATA%\Playscreen\language (lue aussi par la sentinelle), modifiable dans
// Paramètres. Sans ce fichier : la langue de Windows.
//
// L'interface est écrite en français ; en anglais, chaque texte affiché est remplacé au
// moment où il apparaît (dictionnaire en.ts). Un texte absent du dictionnaire reste en
// français : rien ne disparaît, rien ne casse.

import { EN, PATTERNS } from "./en.ts";

export type Language = "fr" | "en";

const IN_TAURI = "__TAURI_INTERNALS__" in window;

let current: Language = "fr";

/** Langue de l'interface. */
export function language(): Language {
  return current;
}

/** Pour les dates et les nombres (toLocaleString…). */
export function locale(): string {
  return current === "en" ? "en-US" : "fr-FR";
}

function fromSystem(): Language {
  return (navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Lit la langue choisie (installateur ou Paramètres), sinon celle de Windows. */
export async function loadLanguage(): Promise<Language> {
  let saved: string | null = null;
  if (IN_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      saved = await invoke<string | null>("app_language");
    } catch {
      saved = null;
    }
  }
  current = saved === "en" || saved === "fr" ? saved : fromSystem();
  document.documentElement.lang = current;
  return current;
}

/** Change la langue (Paramètres) : enregistrée pour Playscreen et la sentinelle, puis rechargement. */
export async function changeLanguage(next: Language): Promise<void> {
  if (IN_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_app_language", { language: next });
  }
  window.location.reload();
}

// ——— Traduction des textes affichés ———

const compiled = PATTERNS.map(([fr, en]) => {
  const escaped = fr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{(\d)\\\}/g, "(?<g$1>.+?)");
  return { regex: new RegExp(`^${escaped}$`, "s"), en };
}).sort((a, b) => b.regex.source.length - a.regex.source.length);

/** Texte anglais d'un texte français affiché (lui-même s'il n'est pas connu). */
export function translate(text: string): string {
  if (current === "fr") return text;
  const core = text.replace(/\s+/g, " ").trim();
  if (!core) return text;
  let out = EN[core];
  if (out === undefined) {
    for (const { regex, en } of compiled) {
      const match = regex.exec(core);
      if (match?.groups) {
        // Les parties variables peuvent être elles-mêmes des textes connus (« il y a 3 jours »).
        out = en.replace(/\{(\d)\}/g, (_, i: string) => {
          const part = match.groups?.[`g${i}`] ?? "";
          return part === core ? part : translate(part);
        });
        break;
      }
    }
  }
  if (out === undefined) return text;
  // Les espaces autour (séparation avec le texte voisin) sont gardés.
  const lead = /^\s*/.exec(text)?.[0] ?? "";
  const trail = /\s*$/.exec(text)?.[0] ?? "";
  return lead + out + trail;
}

const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
/** Dernier texte écrit par la traduction, pour ne pas retraduire ce qu'on vient de changer. */
const written = new WeakMap<Node, string>();

function translateText(node: Text) {
  const value = node.nodeValue ?? "";
  if (written.get(node) === value) return;
  const next = translate(value);
  written.set(node, next);
  if (next !== value) node.nodeValue = next;
}

function translateAttributes(element: Element) {
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const next = translate(value);
    if (next !== value) element.setAttribute(name, next);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  if (element.closest("input, textarea")) return;
  translateAttributes(element);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
    else translateAttributes(node as Element);
  }
}

/** En anglais : traduit l'écran au fil des changements. Sans effet en français. */
export function startTranslation() {
  if (current === "fr") return;
  translateTree(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateText(mutation.target as Text);
      else if (mutation.type === "attributes") translateAttributes(mutation.target as Element);
      else mutation.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
}
