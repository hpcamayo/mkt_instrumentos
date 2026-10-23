-- Effortless Laria, inventory batch (docs/ux-effortless/inventory.md, stock-03). Its own file because a new enum value
-- cannot be used in the transaction that adds it: "correction" is the movement that undoes another movement.
alter type public.stock_movement_type add value if not exists 'correction';
