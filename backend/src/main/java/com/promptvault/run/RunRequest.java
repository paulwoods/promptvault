package com.promptvault.run;

import java.util.Map;

/** Run request body: the supplied Variable values. */
public record RunRequest(Map<String, String> values) {

    public Map<String, String> valuesOrEmpty() {
        return values == null ? Map.of() : values;
    }
}
