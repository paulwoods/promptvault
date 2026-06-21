package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.AbstractDatabaseTest;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Concurrency check for version numbering. Not transactional (real concurrent
 * commits are needed for the FOR UPDATE lock to serialize), so it truncates
 * afterwards instead of relying on rollback.
 */
class VersionNumberingConcurrencyTest extends AbstractDatabaseTest {

    private static final int CONCURRENT_APPENDS = 10;

    @Autowired
    private PromptService promptService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("truncate table version, prompt, api_key, users cascade");
    }

    private static VersionRequest request(String name) {
        return new VersionRequest(name, null, "Hello", "claude-opus-4-8", null, 1000, "medium", "off");
    }

    @Test
    void concurrentAppendsDoNotDuplicateOrSkipNumbers() throws Exception {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash) values (?, ?, ?)",
                userId,
                "concurrent@example.com",
                "hash");
        UUID promptId = promptService.createPrompt(userId, request("v1")).getPromptId();

        ExecutorService pool = Executors.newFixedThreadPool(CONCURRENT_APPENDS);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var futures = IntStream.range(0, CONCURRENT_APPENDS)
                    .mapToObj(i -> pool.submit(() -> {
                        start.await();
                        promptService.addVersion(userId, promptId, request("v"));
                        return null;
                    }))
                    .toList();
            start.countDown();
            for (Future<?> future : futures) {
                future.get();
            }
        } finally {
            pool.shutdown();
        }

        List<Integer> numbers = jdbcTemplate.queryForList(
                "select number from version where prompt_id = ? order by number", Integer.class, promptId);
        assertThat(numbers)
                .containsExactlyElementsOf(
                        IntStream.rangeClosed(1, CONCURRENT_APPENDS + 1).boxed().toList());
    }
}
