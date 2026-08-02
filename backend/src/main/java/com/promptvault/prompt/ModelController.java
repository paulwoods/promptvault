package com.promptvault.prompt;

import com.promptvault.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/models")
public class ModelController {

    private static final Logger log = LoggerFactory.getLogger(ModelController.class);

    private final ModelCatalog catalog;
    private final CurrentUser currentUser;

    public ModelController(ModelCatalog catalog, CurrentUser currentUser) {
        this.catalog = catalog;
        this.currentUser = currentUser;
    }

    @GetMapping
    public ModelsResponse models() {
        log.debug("models(userId={})", currentUser.userId());
        return new ModelsResponse(catalog.all(), catalog.defaultModel());
    }
}
