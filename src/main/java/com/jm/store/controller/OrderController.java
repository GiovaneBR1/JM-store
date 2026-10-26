package com.jm.store.controller;
import com.jm.store.entity.*; import com.jm.store.repository.*;
import org.springframework.web.bind.annotation.*; import java.util.*;
@RestController @RequestMapping("/api/orders")
public class OrderController {
    private final OrderRepository repo;
    public OrderController(OrderRepository repo){this.repo=repo;}
    @GetMapping public List<Order> list(){return repo.findAll();}
}
