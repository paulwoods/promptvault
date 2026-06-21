package com.promptvault.prompt;

import com.promptvault.error.DomainValidationException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Validates and normalizes declared Variables: names match the placeholder
 * charset and are unique within the Version; {@code required} defaults to true.
 */
@Component
public class VariableValidator {

    static final Pattern NAME_PATTERN = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    public List<VariableDeclaration> normalize(List<VariableDeclaration> input) {
        if (input == null || input.isEmpty()) {
            return List.of();
        }
        Set<String> seen = new HashSet<>();
        List<VariableDeclaration> normalized = new ArrayList<>(input.size());
        for (VariableDeclaration variable : input) {
            String name = variable.name();
            if (!NAME_PATTERN.matcher(name).matches()) {
                throw new DomainValidationException("variables", "Invalid variable name: " + name);
            }
            if (!seen.add(name)) {
                throw new DomainValidationException("variables", "Duplicate variable name: " + name);
            }
            boolean required = variable.required() == null || variable.required();
            normalized.add(new VariableDeclaration(name, variable.description(), required, variable.defaultValue()));
        }
        return normalized;
    }
}
