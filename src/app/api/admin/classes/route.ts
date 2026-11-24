import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

const uuid = z.string().uuid();
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_class'), name: z.string().trim().min(1).max(20), grade: z.number().int().min(7).max(12) }),
  z.object({ action: z.literal('add_teacher'), class_id: uuid, teacher_id: uuid }),
  z.object({ action: z.literal('remove_teacher'), class_id: uuid, teacher_id: uuid }),
  z.object({ action: z.literal('add_student'), class_id: uuid, student_id: uuid }),
  z.object({ action: z.literal('remove_student'), class_id: uuid, student_id: uuid }),
]);

const currentYear = () => { const d = new Date(); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; };

/** Сыныптарды басқару (тек әкімші): сынып ашу, мұғалім бекіту, оқушыны сыныпқа қосу/шығару. */
export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['admin']);
  const input = await parseBody(req, body);
  const admin = createAdminClient();

  switch (input.action) {
    case 'create_class': {
      const name = input.name.toUpperCase().replace(/\s+/g, '');
      const year = currentYear();
      const { data: ex } = await admin.from('classes').select('id').eq('name', name).eq('academic_year', year).maybeSingle();
      if (ex) throw new ApiError(409, `${name} сыныбы бұрыннан бар`);
      const { data, error } = await admin.from('classes').insert({ name, grade: input.grade, academic_year: year }).select('id').single();
      if (error) throw error;
      await audit(actor.id, 'class.create', 'class', data.id as string, { name, grade: input.grade });
      return json({ ok: true, id: data.id }, 201);
    }
    case 'add_teacher': {
      const { data: t } = await admin.from('profiles').select('role').eq('id', input.teacher_id).maybeSingle();
      if (!t || !['teacher', 'admin'].includes(t.role as string)) throw new ApiError(400, 'Бұл аккаунт мұғалім емес');
      const { error } = await admin.from('teacher_assignments').upsert({ class_id: input.class_id, teacher_id: input.teacher_id }, { onConflict: 'class_id,teacher_id', ignoreDuplicates: true });
      if (error) throw error;
      await audit(actor.id, 'class.add_teacher', 'class', input.class_id, { teacher_id: input.teacher_id });
      return json({ ok: true });
    }
    case 'remove_teacher': {
      const { error } = await admin.from('teacher_assignments').delete().eq('class_id', input.class_id).eq('teacher_id', input.teacher_id);
      if (error) throw error;
      await audit(actor.id, 'class.remove_teacher', 'class', input.class_id, { teacher_id: input.teacher_id });
      return json({ ok: true });
    }
    case 'add_student': {
      const [{ data: s }, { data: c }] = await Promise.all([
        admin.from('profiles').select('role').eq('id', input.student_id).maybeSingle(),
        admin.from('classes').select('grade, academic_year').eq('id', input.class_id).maybeSingle(),
      ]);
      if (!s || s.role !== 'student') throw new ApiError(400, 'Бұл аккаунт оқушы емес');
      if (!c) throw new ApiError(404, 'Сынып табылмады');
      // Оқушы бір оқу жылында бір сыныпта ғана: басқа сыныптан шығарып, осыған ауыстырамыз
      const { data: same } = await admin.from('classes').select('id').eq('academic_year', c.academic_year);
      const others = ((same ?? []) as { id: string }[]).map((x) => x.id).filter((id) => id !== input.class_id);
      if (others.length) await admin.from('class_members').delete().eq('student_id', input.student_id).in('class_id', others);
      const { error } = await admin.from('class_members').upsert({ class_id: input.class_id, student_id: input.student_id }, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
      if (error) throw error;
      await admin.from('profiles').update({ current_grade: c.grade }).eq('id', input.student_id);
      await audit(actor.id, 'class.add_student', 'class', input.class_id, { student_id: input.student_id });
      return json({ ok: true });
    }
    case 'remove_student': {
      const { error } = await admin.from('class_members').delete().eq('class_id', input.class_id).eq('student_id', input.student_id);
      if (error) throw error;
      await audit(actor.id, 'class.remove_student', 'class', input.class_id, { student_id: input.student_id });
      return json({ ok: true });
    }
  }
});
