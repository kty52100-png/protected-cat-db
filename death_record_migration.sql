-- 保護猫DB：死亡記録の登録処理
-- 実行前にSupabaseのSQL Editorでプロジェクトのバックアップ/復旧手段を確認してください。
-- このSQLは既存の列・制約を削除しません。猫の死亡情報とdeathsを同期するRPCを追加します。

CREATE OR REPLACE FUNCTION public.record_cat_death(
  p_cat_id uuid,
  p_death_date date,
  p_cause text DEFAULT '',
  p_veterinary_hospital text DEFAULT '',
  p_note text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ログインが必要です';
  END IF;

  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION '死亡記録を登録する権限がありません';
  END IF;

  IF p_cat_id IS NULL OR p_death_date IS NULL THEN
    RAISE EXCEPTION '猫IDと死亡日は必須です';
  END IF;

  -- 現行CHECK制約との互換性を保つため、古い列にも同期する。
  UPDATE public.cats
     SET status = 'deceased',
         death_date = p_death_date,
         death_cause = COALESCE(p_cause, ''),
         updated_by = auth.uid()
   WHERE id = p_cat_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '対象の猫が見つからないか、削除済みです';
  END IF;

  INSERT INTO public.deaths (
    cat_id, death_date, cause, veterinary_hospital, note, created_by
  ) VALUES (
    p_cat_id, p_death_date, COALESCE(p_cause, ''),
    COALESCE(p_veterinary_hospital, ''), COALESCE(p_note, ''), auth.uid()
  )
  ON CONFLICT (cat_id) DO UPDATE SET
    death_date = EXCLUDED.death_date,
    cause = EXCLUDED.cause,
    veterinary_hospital = EXCLUDED.veterinary_hospital,
    note = EXCLUDED.note;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cat_death(uuid, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_cat_death(uuid, date, text, text, text) TO authenticated;

-- 実行後の確認用（結果がtrueであること）
SELECT
  to_regprocedure('public.record_cat_death(uuid,date,text,text,text)') IS NOT NULL
    AS record_cat_death_function_created;
