package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.TokenSink;
import com.promptvault.claude.Usage;
import com.promptvault.error.DomainValidationException;
import com.promptvault.prompt.Prompt;
import com.promptvault.prompt.VariableDeclaration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RunPreparationTest {

    private final RunPreparer preparer = new RunPreparer();

    private static Prompt prompt(String promptText, String systemPrompt, List<VariableDeclaration> variables) {
        return new Prompt(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Name",
                null,
                promptText,
                "claude-opus-4-8",
                systemPrompt,
                1000,
                "medium",
                "off",
                variables);
    }

    @Test
    void substitutesValuesAndKeepsSystemPromptSeparate() {
        Prompt prompt =
                prompt("Hello {{name}}", "Be nice", List.of(new VariableDeclaration("name", null, true, null)));

        ClaudeRequest request = preparer.prepare(prompt, Map.of("name", "World"));

        assertThat(request.userMessage()).isEqualTo("Hello World");
        assertThat(request.systemPrompt()).isEqualTo("Be nice");

        // The fake (the seam) receives the substituted prompt and separate system prompt.
        FakeClaudeClient fake = new FakeClaudeClient();
        fake.respondWith(List.of("ok"), new Usage(1, 1));
        fake.stream(request, "sk-ant", noopSink());
        assertThat(fake.capturedRequest().userMessage()).isEqualTo("Hello World");
        assertThat(fake.capturedRequest().systemPrompt()).isEqualTo("Be nice");
    }

    @Test
    void missingRequiredValueRejectedPreCall() {
        Prompt prompt = prompt("Hello {{name}}", null, List.of(new VariableDeclaration("name", null, true, null)));

        assertThatThrownBy(() -> preparer.prepare(prompt, Map.of())).isInstanceOf(DomainValidationException.class);
    }

    @Test
    void blankRequiredValueRejected() {
        Prompt prompt = prompt("Hello {{name}}", null, List.of(new VariableDeclaration("name", null, true, null)));

        assertThatThrownBy(() -> preparer.prepare(prompt, Map.of("name", "   ")))
                .isInstanceOf(DomainValidationException.class);
    }

    @Test
    void optionalAbsentValueUsesDefaultElseEmpty() {
        Prompt withDefault = prompt("{{topic}}", null, List.of(new VariableDeclaration("topic", null, false, "AI")));
        assertThat(preparer.prepare(withDefault, Map.of()).userMessage()).isEqualTo("AI");

        Prompt noDefault = prompt("[{{topic}}]", null, List.of(new VariableDeclaration("topic", null, false, null)));
        assertThat(preparer.prepare(noDefault, Map.of()).userMessage()).isEqualTo("[]");
    }

    @Test
    void unknownSuppliedKeyRejected() {
        Prompt prompt = prompt("hello", null, List.of());

        assertThatThrownBy(() -> preparer.prepare(prompt, Map.of("bogus", "x")))
                .isInstanceOf(DomainValidationException.class);
    }

    private static TokenSink noopSink() {
        return new TokenSink() {
            @Override
            public void onToken(String text) {}

            @Override
            public void onComplete(Usage usage) {}

            @Override
            public void onError(com.promptvault.claude.ClaudeException error) {}
        };
    }
}
