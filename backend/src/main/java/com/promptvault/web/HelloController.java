package com.promptvault.web;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    private static final Logger log = LoggerFactory.getLogger(HelloController.class);

    /** Public smoke/health endpoint (permitAll in the security config); also the Docker healthcheck target. */
    @GetMapping("/api/hello")
    public Map<String, String> hello() {
        log.debug("hello()");
        return Map.of("status", "ok", "service", "promptvault");
    }
}
