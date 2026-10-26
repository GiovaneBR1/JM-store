package com.jm.store.entity;
import jakarta.persistence.*;
import lombok.*;
@Entity @Table(name="customers")
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class Customer {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Long id;
    private String email;
    private String name;
}
