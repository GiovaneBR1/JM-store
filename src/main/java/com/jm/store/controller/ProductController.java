package com.jm.store.controller;
import com.jm.store.entity.*; import com.jm.store.repository.*;
import org.springframework.web.bind.annotation.*; import java.util.*;
@RestController @RequestMapping("/api/products")
public class ProductController {
    private final ProductRepository repo;
    public ProductController(ProductRepository repo){this.repo=repo;}
    @GetMapping public List<Product> list(){return repo.findAll();}
}
