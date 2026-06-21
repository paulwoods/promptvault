package com.promptvault.prompt;

/** A supported model and which Run Settings it supports. */
public record ModelCapability(String id, boolean supportsEffort, boolean supportsAdaptiveThinking) {}
