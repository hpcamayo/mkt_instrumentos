-- Effortless Laria, accounts batch, fix-01: every WhatsApp number is stored with the country code.
-- Every fixture rolls back.
begin;
do $$ begin
 if laria_private.normalize_pe_phone('987 654 321') <> '51987654321' then raise exception 'Peruvian mobile without 51'; end if;
 if laria_private.normalize_pe_phone('+51 987-654-321') <> '51987654321' then raise exception 'Formatted +51 number'; end if;
 if laria_private.normalize_pe_phone('0051987654321') <> '51987654321' then raise exception 'International 00 prefix'; end if;
 if laria_private.normalize_pe_phone('51987654321') <> '51987654321' then raise exception 'Correct number changed'; end if;
 if laria_private.normalize_pe_phone('+1 415 555 0100') <> '14155550100' then raise exception 'Foreign number changed'; end if;
 if laria_private.normalize_pe_phone('812345678') <> '812345678' then raise exception 'Non-mobile 9 digits got 51'; end if;
 if laria_private.normalize_pe_phone(null) is not null then raise exception 'Null phone'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('a2030000-0000-4000-8000-000000000001','authenticated','authenticated','ux-phone@example.invalid','{}','{"account_type":"seller","full_name":"Teléfono","phone":"987654321","city":"Lima","region":"Lima"}');
do $$ begin
 if (select phone from public.profiles where id='a2030000-0000-4000-8000-000000000001') <> '51987654321' then raise exception 'Sign-up phone not normalized'; end if;
end $$;

insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,created_by_source,marketplace_rules_accepted_at)
values('a2030000-0000-4000-8000-000000000101','ux-phone-live','Guitarra teléfono','individual','approved','guitars','electric_guitar','Yamaha','QA','Usado - buen estado',1200,'Lima','Lima','Teléfono','987 654 321','Descripción de prueba suficientemente extensa para publicar este instrumento.','a2030000-0000-4000-8000-000000000001','admin',now());
do $$ begin
 if (select whatsapp_phone from public.listings where slug='ux-phone-live') <> '51987654321' then raise exception 'Listing phone not normalized'; end if;
end $$;

-- The owner retypes the same number the Peruvian way on an approved listing: not a contact change.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2030000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.listings set whatsapp_phone='987 654 321' where slug='ux-phone-live';
update public.profiles set phone='+51 912 345 678' where id='a2030000-0000-4000-8000-000000000001';
do $$ begin
 if (select phone from public.profiles where id='a2030000-0000-4000-8000-000000000001') <> '51912345678' then raise exception 'Profile edit not normalized'; end if;
end $$;
reset role;

insert into public.stores(id,name,slug,status,whatsapp_phone,city,region)
values('a2030000-0000-4000-8000-000000000201','Tienda teléfono','ux-phone-store','pending','998877665','Lima','Lima');
do $$ begin
 if (select whatsapp_phone from public.stores where slug='ux-phone-store') <> '51998877665' then raise exception 'Store phone not normalized'; end if;
end $$;
rollback;
