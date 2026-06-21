package com.promptvault.prompt;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/models")
public class ModelController {

    private final ModelCatalog catalog;

    public ModelController(ModelCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public ModelsResponse models() {
        return new ModelsResponse(catalog.all(), catalog.defaultModel());
    }
}
