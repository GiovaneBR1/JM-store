package com.jm.store.entity;
import jakarta.persistence.*;
import lombok.*;
import java.util.*;
@Entity @Table(name="categories")
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class Category {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Long id;
    private String name;
    private String description;
    @OneToMany(mappedBy="category")
    private List<Product> products;
}
