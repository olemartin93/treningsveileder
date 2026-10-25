import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importWorkoutCsv, parseCsv, parseDuration } from '../lib/csvImport';
import { HealthXmlParser } from '../lib/healthParser';
import { parseShortcutParams } from '../lib/shortcutImport';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and semicolons', () => {
    expect(parseCsv('a;b\n"x;1";"he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'he said "hi"'],
    ]);
  });
});

describe('importWorkoutCsv', () => {
  it('imports a Lyfta-style export', () => {
    const csv = [
      'Date,Workout Name,Exercise,Set Type,Weight (kg),Reps,Duration',
      '2024-03-04 17:30:00,Push,Bench Press,Warm Up,40,10,01:05:00',
      '2024-03-04 17:30:00,Push,Bench Press,Normal,80,8,01:05:00',
      '2024-03-04 17:30:00,Push,Bench Press,Normal,80,7,01:05:00',
      '2024-03-04 17:30:00,Push,Lateral Raise,Normal,10,15,01:05:00',
      '2024-03-06 18:00:00,Pull,Barbell Row,Normal,"70,5",8,55m',
    ].join('\n');
    const r = importWorkoutCsv(csv);
    expect(r.workouts).toHaveLength(2);
    const push = r.workouts[0];
    expect(push?.title).toBe('Push');
    expect(push?.durationMin).toBe(65);
    expect(push?.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Lateral Raise']);
    expect(push?.exercises[0]?.sets[0]?.warmup).toBe(true);
    expect(push?.exercises[0]?.sets[1]).toMatchObject({ weight: 80, reps: 8 });
    expect(r.workouts[1]?.exercises[0]?.sets[0]?.weight).toBe(70.5);
    expect(r.workouts[1]?.durationMin).toBe(55);
  });

  it('imports a Hevy-style export with day-first dates and lbs', () => {
    const csv = [
      'title,start_time,end_time,exercise_title,set_type,weight_lbs,reps',
      'Legs,"25 Mar 2024, 07:00","25 Mar 2024, 08:00",Squat (Barbell),normal,225,5',
    ].join('\n');
    const r = importWorkoutCsv(csv);
    expect(r.workouts[0]?.exercises[0]?.sets[0]?.weight).toBeCloseTo(102.1, 0);
    expect(r.workouts[0]?.durationMin).toBe(60);
  });

  it('detects day-first numeric dates', () => {
    const csv = 'Dato;Øvelse;Vekt;Reps\n13/02/2024 10:00;Knebøy;100;5\n';
    const r = importWorkoutCsv(csv);
    const d = new Date(r.workouts[0]?.date ?? '');
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(13);
  });

  it('rejects files without the needed columns', () => {
    expect(() => importWorkoutCsv('foo,bar\n1,2')).toThrow();
  });
});

describe('parseDuration', () => {
  it.each([
    ['1h 5m', 65],
    ['01:05:00', 65],
    ['45', 45],
    ['3600', 60],
  ])('%s -> %i', (input, expected) => expect(parseDuration(input)).toBe(expected));
});

const XML = `<?xml version="1.0"?>
<HealthData locale="nb_NO">
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-10-20 08:00:00 +0200" endDate="2026-10-20 09:00:00 +0200" value="4000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-10-20 12:00:00 +0200" endDate="2026-10-20 13:00:00 +0200" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-10-20 08:00:00 +0200" endDate="2026-10-20 13:00:00 +0200" value="6500"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-10-20 07:00:00 +0200" endDate="2026-10-20 07:00:00 +0200" value="52"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" unit="ms" startDate="2026-10-20 03:00:00 +0200" endDate="2026-10-20 03:01:00 +0200" value="60">
  <HeartRateVariabilityMetadataList/>
 </Record>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" unit="ms" startDate="2026-10-20 05:00:00 +0200" endDate="2026-10-20 05:01:00 +0200" value="40"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-10-19 23:00:00 +0200" endDate="2026-10-20 03:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-10-20 03:00:00 +0200" endDate="2026-10-20 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepREM"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-10-19 22:30:00 +0200" endDate="2026-10-20 07:00:00 +0200" value="HKCategoryValueSleepAnalysisInBed"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Vekt" unit="kg" startDate="2026-10-20 07:10:00 +0200" endDate="2026-10-20 07:10:00 +0200" value="82.4"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2020-01-01 08:00:00 +0100" endDate="2020-01-01 09:00:00 +0100" value="999"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="62.5" durationUnit="min" sourceName="Lyfta" startDate="2026-10-20 17:00:00 +0200" endDate="2026-10-20 18:02:30 +0200">
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="350"/>
 </Workout>
</HealthData>`;

describe('HealthXmlParser', () => {
  const check = (p: HealthXmlParser): void => {
    const { days, workouts } = p.finish();
    expect(days).toHaveLength(1);
    expect(days[0]).toEqual({ date: '2026-10-20', steps: 7000, restingHr: 52, hrv: 50, sleepHours: 7.5, bodyMass: 82.4 });
    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toMatchObject({ activity: 'TraditionalStrengthTraining', durationMin: 63 });
  };

  it('aggregates records even when split into tiny chunks', () => {
    const p = new HealthXmlParser(30, new Date('2026-10-25T12:00:00Z'));
    for (let i = 0; i < XML.length; i += 7) p.push(XML.slice(i, i + 7));
    check(p);
  });

  it('reads export.xml from a zip via the streaming unzipper', async () => {
    const { Unzip, UnzipInflate } = await import('fflate');
    const zip = zipSync({ 'apple_health_export/eksport.xml': strToU8(XML), 'apple_health_export/export_cda.xml': strToU8('<x/>') });
    const p = new HealthXmlParser(30, new Date('2026-10-25T12:00:00Z'));
    const dec = new TextDecoder();
    const u = new Unzip();
    u.register(UnzipInflate);
    u.onfile = (f) => {
      if (!/(export|eksport)\.xml$/.test(f.name)) return;
      f.ondata = (_e, chunk, final) => p.push(dec.decode(chunk, { stream: !final }));
      f.start();
    };
    for (let i = 0; i < zip.length; i += 100) u.push(zip.subarray(i, i + 100), i + 100 >= zip.length);
    check(p);
  });
});

describe('parseShortcutParams', () => {
  it('parses Norwegian values with units and comma decimals', () => {
    const d = parseShortcutParams(new URLSearchParams('hvilepuls=52 count/min&hrv=61,4&sovnmin=450&skritt=9 500&vekt=82,3'), new Date(2026, 9, 25));
    expect(d).toEqual({ date: '2026-10-25', restingHr: 52, hrv: 61, sleepHours: 7.5, steps: 9500, bodyMass: 82.3 });
  });
  it('converts sleep given in seconds', () => {
    expect(parseShortcutParams(new URLSearchParams('sovnmin=27000'))?.sleepHours).toBe(7.5);
  });
  it('returns null without values', () => {
    expect(parseShortcutParams(new URLSearchParams('hrv='))).toBeNull();
  });
});
