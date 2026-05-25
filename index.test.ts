import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
	MAX_NEW_SESSION_NAME_LENGTH,
	TELEGRAM_RECONNECT_CONSUMED_ENTRY_TYPE,
	TELEGRAM_RECONNECT_REQUEST_ENTRY_TYPE,
	findPendingTelegramReconnectRequest,
	formatNewSessionConfirmation,
	parseTelegramNewSessionName,
	shouldWaitForTelegramPollingToStop,
} from "./index";

describe("parseTelegramNewSessionName", () => {
	test("returns undefined for plain /new", () => {
		expect(parseTelegramNewSessionName("/new")).toEqual({
			name: undefined,
			truncated: false,
		});
	});

	test("treats whitespace-only suffix as unnamed", () => {
		expect(parseTelegramNewSessionName("/new    ")).toEqual({
			name: undefined,
			truncated: false,
		});
	});

	test("parses a trimmed session name", () => {
		expect(parseTelegramNewSessionName("/new   auth bug   ")).toEqual({
			name: "auth bug",
			truncated: false,
		});
	});

	test("truncates names over the limit", () => {
		const longName = "x".repeat(MAX_NEW_SESSION_NAME_LENGTH + 5);
		expect(parseTelegramNewSessionName(`/new ${longName}`)).toEqual({
			name: "x".repeat(MAX_NEW_SESSION_NAME_LENGTH),
			truncated: true,
		});
	});
});

describe("formatNewSessionConfirmation", () => {
	test("formats unnamed sessions", () => {
		expect(formatNewSessionConfirmation({ truncated: false })).toBe("Started new session.");
	});

	test("formats named sessions", () => {
		expect(formatNewSessionConfirmation({ name: "auth bug", truncated: false })).toBe("Started new session: auth bug");
	});

	test("mentions truncation", () => {
		expect(formatNewSessionConfirmation({ name: "x".repeat(80), truncated: true })).toBe(
			"Started new session: " + "x".repeat(80) + " (name truncated to 80 chars).",
		);
	});
});

describe("Telegram /new dispatch regression", () => {
	test("does not bridge through an extension-injected slash command", () => {
		const source = readFileSync("index.ts", "utf8");
		expect(source).not.toContain("/telegram-new");
	});

	test("does not await the polling loop while handling a Telegram update", () => {
		expect(shouldWaitForTelegramPollingToStop(true)).toBe(false);
		expect(shouldWaitForTelegramPollingToStop(false)).toBe(true);
	});

	test("finds an unconsumed reconnect request for the new session startup path", () => {
		const entries = [
			{ type: "custom", customType: TELEGRAM_RECONNECT_REQUEST_ENTRY_TYPE, data: { requestId: "one", chatId: 1, replyToMessageId: 10 } },
			{ type: "custom", customType: TELEGRAM_RECONNECT_CONSUMED_ENTRY_TYPE, data: { requestId: "one" } },
			{ type: "custom", customType: TELEGRAM_RECONNECT_REQUEST_ENTRY_TYPE, data: { requestId: "two", chatId: 2, replyToMessageId: 20, sessionName: "fresh" } },
		];

		expect(findPendingTelegramReconnectRequest(entries)).toEqual({
			requestId: "two",
			chatId: 2,
			replyToMessageId: 20,
			sessionName: "fresh",
		});
	});
});
