package com.promptvault.run;

/** All-time token totals for one model, summed across a User's Runs. */
public record ModelUsage(String model, long inputTokens, long outputTokens) {}
