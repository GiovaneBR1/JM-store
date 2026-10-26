package com.jm.store.entity;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
@Entity @Table(name="order_items")
@Data @NoArgsConstructor @AllArgsConstructor @Builder
public class OrderItem {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Long id;
    @ManyToOne @JoinColumn(name="order_id")
    private Order order;
    @ManyToOne @JoinColumn(name="product_id")
    private Product product;
    private Integer quantity;
    private BigDecimal unitPrice;
}
