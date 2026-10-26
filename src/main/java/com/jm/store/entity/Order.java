package com.jm.store.entity;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
@Entity @Table(name="orders")
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class Order {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Long id;
    @ManyToOne @JoinColumn(name="customer_id")
    private Customer customer;
    private BigDecimal total;
    private String status;
    private Instant createdAt;
    @OneToMany(mappedBy="order", cascade=CascadeType.ALL)
    private List<OrderItem> items;
}
