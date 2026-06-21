package com.promptvault.run;

import org.springframework.stereotype.Component;

/** Runs each Run's streaming on its own virtual thread (blocking push, Java 25). */
@Component
public class VirtualThreadStreamingExecutor implements StreamingExecutor {

    @Override
    public void execute(Runnable task) {
        Thread.ofVirtual().name("run-stream-", 0).start(task);
    }
}
