package com.promptvault.prompt;

import com.promptvault.error.DomainValidationException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Enforces that the set of {@code {{placeholder}}} names in the prompt text
 * matches the set of declared Variable names exactly. Inner whitespace is
 * trimmed and duplicates are counted once; a {@code {{...}}} whose inner text
 * is not a valid name is a malformed-placeholder error.
 */
@Component
public class PlaceholderValidator {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{(.*?)\\}\\}", Pattern.DOTALL);

    public void validateSetEquality(String promptText, List<VariableDeclaration> variables) {
        Set<String> placeholders = extractPlaceholders(promptText);
        Set<String> declared =
                variables.stream().map(VariableDeclaration::name).collect(Collectors.toCollection(LinkedHashSet::new));

        Set<String> undeclared = new LinkedHashSet<>(placeholders);
        undeclared.removeAll(declared);
        if (!undeclared.isEmpty()) {
            throw new DomainValidationException("variables", "Placeholders without a declared Variable: " + undeclared);
        }

        Set<String> unused = new LinkedHashSet<>(declared);
        unused.removeAll(placeholders);
        if (!unused.isEmpty()) {
            throw new DomainValidationException("variables", "Declared Variables not used in the prompt: " + unused);
        }
    }

    private Set<String> extractPlaceholders(String promptText) {
        Set<String> names = new LinkedHashSet<>();
        Matcher matcher = PLACEHOLDER.matcher(promptText);
        while (matcher.find()) {
            String inner = matcher.group(1).trim();
            if (!VariableValidator.NAME_PATTERN.matcher(inner).matches()) {
                throw new DomainValidationException(
                        "promptText", "Malformed placeholder: {{" + matcher.group(1) + "}}");
            }
            names.add(inner);
        }
        return names;
    }
}
