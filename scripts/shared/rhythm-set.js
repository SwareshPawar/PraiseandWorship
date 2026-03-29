(function initializeRhythmSetUtils(global) {
    function createRhythmSetUtils() {
        const RHYTHM_SET_DEFAULT_NO = 1;
        const RHYTHM_CATEGORY_OPTIONS = ['Indian', 'Western', 'Others'];

        function normalizeRhythmFamily(value) {
            if (typeof value !== 'string') return '';
            return value
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_-]/g, '');
        }

        function normalizeRhythmCategory(value) {
            if (typeof value !== 'string') return '';
            const normalized = value.trim().toLowerCase();
            if (!normalized) return '';
            if (normalized === 'indian') return 'Indian';
            if (normalized === 'western') return 'Western';
            if (normalized === 'others' || normalized === 'other') return 'Others';
            return '';
        }

        function normalizeRhythmSetNo(value) {
            const parsed = parseInt(value, 10);
            if (!Number.isInteger(parsed) || parsed <= 0) {
                return null;
            }
            return parsed;
        }

        function parseRhythmSetId(rhythmSetId) {
            if (typeof rhythmSetId !== 'string') return null;
            const cleaned = rhythmSetId.trim().toLowerCase();
            const match = cleaned.match(/^(.+)_([0-9]+)$/);
            if (!match) return null;

            const rhythmFamily = normalizeRhythmFamily(match[1]);
            const rhythmSetNo = normalizeRhythmSetNo(match[2]);
            if (!rhythmFamily || !rhythmSetNo) return null;

            return {
                rhythmFamily,
                rhythmSetNo,
                rhythmSetId: `${rhythmFamily}_${rhythmSetNo}`
            };
        }

        function buildRhythmSetId(rhythmFamily, rhythmSetNo) {
            const family = normalizeRhythmFamily(rhythmFamily);
            const setNo = normalizeRhythmSetNo(rhythmSetNo);
            if (!family || !setNo) return '';
            return `${family}_${setNo}`;
        }

        function deriveRhythmSetFields(rhythmSetId, fallbackFamily, fallbackSetNo) {
            const parsed = parseRhythmSetId(rhythmSetId);
            if (parsed) {
                return parsed;
            }

            const rhythmFamily = normalizeRhythmFamily(fallbackFamily) || 'unknown';
            const rhythmSetNo = normalizeRhythmSetNo(fallbackSetNo) || RHYTHM_SET_DEFAULT_NO;

            return {
                rhythmFamily,
                rhythmSetNo,
                rhythmSetId: buildRhythmSetId(rhythmFamily, rhythmSetNo) || `${rhythmFamily}_${rhythmSetNo}`
            };
        }

        return {
            RHYTHM_CATEGORY_OPTIONS,
            RHYTHM_SET_DEFAULT_NO,
            buildRhythmSetId,
            deriveRhythmSetFields,
            normalizeRhythmCategory,
            normalizeRhythmFamily,
            normalizeRhythmSetNo,
            parseRhythmSetId
        };
    }

    global.RhythmSetUtils = global.RhythmSetUtils || createRhythmSetUtils();
})(window);