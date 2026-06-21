package com.promptvault.run;

import com.promptvault.claude.ClaudeRequest;
import com.promptvault.error.DomainValidationException;
import com.promptvault.prompt.VariableDeclaration;
import com.promptvault.prompt.Version;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Validates supplied Variable values against a Version's declarations and renders
 * the prompt: required values must be non-blank, optional absent values fall back
 * to the declared default (else empty string), and unknown keys are rejected.
 * Every {{name}} is substituted textually; the rendered text is the user message
 * and the Version's system prompt is carried separately.
 */
@Component
public class RunPreparer {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{(.*?)\\}\\}", Pattern.DOTALL);

    public ClaudeRequest prepare(Version version, Map<String, String> suppliedValues) {
        Map<String, String> supplied = suppliedValues == null ? Map.of() : suppliedValues;
        Set<String> declaredNames =
                version.getVariables().stream().map(VariableDeclaration::name).collect(Collectors.toSet());

        for (String key : supplied.keySet()) {
            if (!declaredNames.contains(key)) {
                throw new DomainValidationException("variables", "Unknown variable: " + key);
            }
        }

        Map<String, String> resolved = new HashMap<>();
        for (VariableDeclaration variable : version.getVariables()) {
            String value = supplied.get(variable.name());
            if (StringUtils.hasText(value)) {
                resolved.put(variable.name(), value);
            } else if (Boolean.TRUE.equals(variable.required())) {
                throw new DomainValidationException("variables", "Missing required variable: " + variable.name());
            } else {
                resolved.put(variable.name(), variable.defaultValue() == null ? "" : variable.defaultValue());
            }
        }

        String renderedPrompt = render(version.getPromptText(), resolved);
        return new ClaudeRequest(
                version.getModel(),
                version.getSystemPrompt(),
                renderedPrompt,
                version.getMaxTokens(),
                version.getEffort(),
                version.getThinking());
    }

    private static String render(String promptText, Map<String, String> values) {
        Matcher matcher = PLACEHOLDER.matcher(promptText);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String name = matcher.group(1).trim();
            matcher.appendReplacement(out, Matcher.quoteReplacement(values.getOrDefault(name, "")));
        }
        matcher.appendTail(out);
        return out.toString();
    }
}
