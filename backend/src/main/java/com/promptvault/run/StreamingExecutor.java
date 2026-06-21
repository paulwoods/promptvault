package com.promptvault.run;

/** Runs a Run's streaming work off the request thread. */
public interface StreamingExecutor {

    void execute(Runnable task);
}
