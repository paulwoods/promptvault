package com.promptvault.prompt;

import jakarta.validation.constraints.NotBlank;

/**
 * A declared Variable on a Prompt. {@code required} defaults to true when
 * omitted; {@code description} and {@code defaultValue} are optional.
 */
public record VariableDeclaration(@NotBlank String name, String description, Boolean required, String defaultValue) {}
