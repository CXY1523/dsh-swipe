// dsh-swipe client bundle: Tavern-style swipe reroll for assistant messages.
// Every finalized assistant message gets a reroll action. Rerolling forks the
// session just before the turn that produced that reply, re-sends the turn's
// user message, and records the fork child as the next version of a local
// version chain. The version reply renders prev/next navigation across the
// chain (one session per version).
window.__ModuleLoader__.load({ id: "dsh-swipe", factory: (require) => {

	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	let react = require("react");
	// Native icon set: same glyphs the shell's own message actions use.
	let primitives = null;
	try { primitives = require("@deepseek-ai/dsh-client-ui-primitives"); } catch (error) { primitives = null; }
	const h = react.createElement;
	const { useState, useSyncExternalStore } = react;

	const icon = (iconName) => (primitives !== null && typeof primitives[iconName] === "function" ? primitives[iconName] : null);
	const IconReroll = icon("IconRefreshOutline16");
	const IconPrev = icon("IconChevronLeftOutline14");
	const IconNext = icon("IconChevronRightOutline14");

	const name = "dsh-swipe";
	const inject = ["slots", "locale", "sessions"];
	const NS = "dsh-swipe";
	const STORE_KEY = "dsh-swipe:v1";

	const zh = {
		"reroll": "换一版",
		"reroll.title": "重新生成这条回复（分叉出新版本）",
		"busy.title": "生成中…",
		"prev": "上一版",
		"next": "下一版",
		"ver.label": "{i}/{n}",
	};
	const en = {
		"reroll": "Reroll",
		"reroll.title": "Regenerate this reply as a forked version",
		"busy.title": "Rerolling…",
		"prev": "Prev",
		"next": "Next",
		"ver.label": "{i}/{n}",
	};

	const CSS = `
.dssw-root{display:inline-flex;align-items:center;gap:2px;height:28px;line-height:1}
.dssw-ctl{display:inline-flex;align-items:center;gap:0}
.dssw-btn{appearance:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:6px;margin:0;border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:28px;font:inherit;line-height:1}
.dssw-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dssw-btn:disabled{cursor:default;opacity:.4}
.dssw-btn:disabled:hover{background:0 0;color:var(--dsw-alias-label-tertiary)}
.dssw-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, currentColor);outline-offset:1px}
.dssw-ver{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;padding:0 3px;font-variant-numeric:tabular-nums;white-space:nowrap}
`;

	if (typeof document !== "undefined") {
		const style = document.createElement("style");
		style.dataset.plugin = name;
		style.textContent = CSS;
		document.head.appendChild(style);
	}

	// ── version-chain store (localStorage + in-page events) ────────────────
	let cache = null;
	const listeners = new Set();
	function notify() { for (const fn of [...listeners]) fn(); }
	function emptyStore() { return { chains: {}, bySession: {} }; }
	function readStore() {
		try {
			const raw = window.localStorage.getItem(STORE_KEY);
			if (!raw) return emptyStore();
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object" || !parsed.chains || !parsed.bySession) return emptyStore();
			return parsed;
		} catch {
			return emptyStore();
		}
	}
	function getStore() {
		if (cache === null) cache = readStore();
		return cache;
	}
	function writeStore(next) {
		cache = next;
		try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
		notify();
	}
	function subscribe(fn) {
		listeners.add(fn);
		return () => listeners.delete(fn);
	}
	if (typeof window !== "undefined") {
		window.addEventListener("storage", (event) => {
			if (event.key === STORE_KEY) { cache = null; notify(); }
		});
	}
	function useSwipeStore() { return useSyncExternalStore(subscribe, getStore, getStore); }

	function cloneStore(store) {
		return { chains: { ...store.chains }, bySession: { ...store.bySession } };
	}

	function addVersion(next, parentSessionId, anchorSeq, childSessionId) {
		const parentRec = next.bySession[parentSessionId];
		const chainId = parentRec !== void 0 ? parentRec.chainId : parentSessionId + ":" + anchorSeq;
		let chain = next.chains[chainId];
		if (chain === void 0) {
			chain = { anchorSeq, versions: [parentSessionId] };
			next.chains[chainId] = chain;
		}
		if (parentRec === void 0) next.bySession[parentSessionId] = { chainId, index: 0 };
		chain.versions.push(childSessionId);
		next.bySession[childSessionId] = { chainId, index: chain.versions.length - 1 };
		return next;
	}

	// ── snapshot helpers (plain functions; selectors only lift `nodes`) ────
	function assistantSeqOf(nodes, messageId) {
		for (const node of nodes) if (node.kind === "assistant" && node.messageId === messageId) return node.seq;
		return void 0;
	}
	function lastUserBefore(nodes, seq) {
		let found;
		for (const node of nodes) if (node.kind === "user" && node.seq < seq) found = node;
		return found;
	}
	function firstUserAfter(nodes, seq) {
		let best;
		for (const node of nodes) {
			if (node.kind !== "user" || node.seq <= seq) continue;
			if (best === void 0 || node.seq < best.seq) best = node;
		}
		return best;
	}
	function firstAssistantAfter(nodes, seq) {
		let best;
		for (const node of nodes) {
			if (node.kind !== "assistant" || node.seq <= seq) continue;
			if (best === void 0 || node.seq < best) best = node.seq;
		}
		return best;
	}
	/**
	 * Fork anchor + re-prompt payload for one assistant reply.
	 * The fork is cut at the end of the reply's *previous* completed turn, so
	 * the child seed stops at this turn's user message and the re-prompt
	 * produces the new version without dragging the old reply along.
	 */
	function buildRerollPlan(nodes, turnEnds, seqA) {
		const user = lastUserBefore(nodes, seqA);
		if (user === void 0) return null;
		const textParts = (user.content ?? []).filter((part) => part && part.type === "text");
		if (textParts.length === 0) return null;
		let prevEnd;
		if (turnEnds !== void 0 && typeof turnEnds.values === "function") {
			for (const value of turnEnds.values()) {
				if (value < user.seq && (prevEnd === void 0 || value > prevEnd)) prevEnd = value;
			}
		}
		return {
			atSeq: prevEnd !== void 0 ? prevEnd : user.seq,
			anchorSeq: user.seq,
			content: textParts,
		};
	}
	/**
	 * Seq of the reply belonging to one version of a chain.
	 * Root session: the first assistant after the anchor user message.
	 * Forked version: the first assistant after the re-sent user message.
	 */
	function versionReplySeqOf(nodes, anchorSeq, isForkedVersion) {
		if (!isForkedVersion) return firstAssistantAfter(nodes, anchorSeq);
		const user = firstUserAfter(nodes, anchorSeq);
		return user === void 0 ? void 0 : firstAssistantAfter(nodes, user.seq);
	}

	// ── action component ───────────────────────────────────────────────────
	function SwipeActions(props) {
		const t = typeof props.t === "function" ? props.t : (key) => key;
		const { messageId, sessionId, useSession, reroll, jump } = props;
		const store = useSwipeStore();
		const [busy, setBusy] = useState(false);
		// Two stable-reference selectors only; every derivation below is plain JS.
		const nodes = useSession((snapshot) => snapshot.nodes);
		const turnEnds = useSession((snapshot) => snapshot.turnEnds);

		const seqA = assistantSeqOf(nodes, messageId);
		const plan = seqA === void 0 ? null : buildRerollPlan(nodes, turnEnds, seqA);

		const rec = store.bySession[sessionId];
		const chain = rec !== void 0 ? store.chains[rec.chainId] : void 0;
		const isVersionReply = seqA !== void 0 && rec !== void 0 && chain !== void 0
			&& seqA === versionReplySeqOf(nodes, chain.anchorSeq, rec.index >= 1);

		if (seqA === void 0) return null;

		const onReroll = () => {
			if (busy || plan === null) return;
			setBusy(true);
			reroll({ sessionId, atSeq: plan.atSeq, content: plan.content, anchorSeq: plan.anchorSeq })
				.catch((error) => console.warn("[dsh-swipe] reroll failed:", error))
				.finally(() => setBusy(false));
		};

		let versionCtl = null;
		if (isVersionReply) {
			const index = rec.index;
			const parts = [];
			if (index > 0) {
				parts.push(h("button", {
					key: "prev",
					type: "button",
					className: "dssw-btn",
					title: t("prev"),
					"aria-label": t("prev"),
					onClick: () => jump(chain.versions[index - 1]),
				}, IconPrev !== null ? h(IconPrev, {}) : "◀"));
			}
			parts.push(h("span", { key: "ver", className: "dssw-ver" }, t("ver.label", { i: index + 1, n: chain.versions.length })));
			if (index < chain.versions.length - 1) {
				parts.push(h("button", {
					key: "next",
					type: "button",
					className: "dssw-btn",
					title: t("next"),
					"aria-label": t("next"),
					onClick: () => jump(chain.versions[index + 1]),
				}, IconNext !== null ? h(IconNext, {}) : "▶"));
			}
			versionCtl = h("span", { className: "dssw-ctl" }, parts);
		}

		return h("span", { className: "dssw-root" },
			versionCtl,
			h("button", {
				type: "button",
				className: "dssw-btn",
				title: busy ? t("busy.title") : t("reroll.title"),
				"aria-label": busy ? t("busy.title") : t("reroll.title"),
				disabled: busy || plan === null,
				onClick: onReroll,
			}, IconReroll !== null ? h(IconReroll, {}) : "⟳"),
		);
	}

	// ── plugin entry ───────────────────────────────────────────────────────
	function apply(ctx) {
		const sessions = ctx.sessions;
		ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-swipe: dictionaries");
		ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
			name: "conversation.chat.assistant-actions",
			id: "dsh-swipe",
			order: 20,
			locale: NS,
			inject: () => ({
				reroll: async ({ sessionId, atSeq, content, anchorSeq }) => {
					const childId = await sessions.fork({ sessionId, atSeq, increaseTitle: true });
					writeStore(addVersion(cloneStore(getStore()), sessionId, anchorSeq, childId));
					sessions.open(childId);
					const child = sessions.binding(childId)?.session;
					if (child !== void 0) {
						try {
							await child.prompt(content, "queue");
						} catch (error) {
							console.warn("[dsh-swipe] re-prompt failed:", error);
						}
					}
					return childId;
				},
				jump: (targetId) => {
					sessions.open(targetId);
				},
			}),
		}, SwipeActions));
	}

	exports.name = name;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}
});
