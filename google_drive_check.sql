-- 保護猫DB PWA v2 / Google Drive連携確認SQL
-- v1のDBを変更する必要はありません。
-- cat_filesにGoogle Driveのメタデータを保存できる構造になっていることを確認します。

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'cat_files'
order by ordinal_position;

-- 写真登録後の確認
select
  cf.id,
  c.management_no,
  c.name,
  cf.drive_file_id,
  cf.drive_folder_id,
  cf.file_name,
  cf.file_url,
  cf.category,
  cf.is_main_photo,
  cf.created_at
from public.cat_files cf
join public.cats c on c.id = cf.cat_id
order by cf.created_at desc
limit 50;
