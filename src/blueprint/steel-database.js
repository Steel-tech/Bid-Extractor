// @ts-nocheck
/**
 * Steel Database - AISC Steel Shapes
 * Bid Extractor v1.5.0 - Steel Takeoff Edition
 *
 * Contains weights per linear foot for common structural steel shapes
 */

const SteelDatabase = (() => {
  // Wide Flange Beams (W shapes) - weight in lbs/ft
  const W_SHAPES = {
    // W44
    'W44X335': 335, 'W44X290': 290, 'W44X262': 262, 'W44X230': 230,
    // W40
    'W40X593': 593, 'W40X503': 503, 'W40X431': 431, 'W40X397': 397,
    'W40X372': 372, 'W40X362': 362, 'W40X324': 324, 'W40X297': 297,
    'W40X277': 277, 'W40X249': 249, 'W40X215': 215, 'W40X199': 199,
    'W40X183': 183, 'W40X167': 167, 'W40X149': 149,
    // W36
    'W36X652': 652, 'W36X529': 529, 'W36X487': 487, 'W36X441': 441,
    'W36X395': 395, 'W36X361': 361, 'W36X330': 330, 'W36X302': 302,
    'W36X282': 282, 'W36X262': 262, 'W36X247': 247, 'W36X231': 231,
    'W36X256': 256, 'W36X232': 232, 'W36X210': 210, 'W36X194': 194,
    'W36X182': 182, 'W36X170': 170, 'W36X160': 160, 'W36X150': 150,
    'W36X135': 135,
    // W33
    'W33X387': 387, 'W33X354': 354, 'W33X318': 318, 'W33X291': 291,
    'W33X263': 263, 'W33X241': 241, 'W33X221': 221, 'W33X201': 201,
    'W33X169': 169, 'W33X152': 152, 'W33X141': 141, 'W33X130': 130,
    'W33X118': 118,
    // W30
    'W30X391': 391, 'W30X357': 357, 'W30X326': 326, 'W30X292': 292,
    'W30X261': 261, 'W30X235': 235, 'W30X211': 211, 'W30X191': 191,
    'W30X173': 173, 'W30X148': 148, 'W30X132': 132, 'W30X124': 124,
    'W30X116': 116, 'W30X108': 108, 'W30X99': 99, 'W30X90': 90,
    // W27
    'W27X539': 539, 'W27X368': 368, 'W27X336': 336, 'W27X307': 307,
    'W27X281': 281, 'W27X258': 258, 'W27X235': 235, 'W27X217': 217,
    'W27X194': 194, 'W27X178': 178, 'W27X161': 161, 'W27X146': 146,
    'W27X129': 129, 'W27X114': 114, 'W27X102': 102, 'W27X94': 94,
    'W27X84': 84,
    // W24
    'W24X370': 370, 'W24X335': 335, 'W24X306': 306, 'W24X279': 279,
    'W24X250': 250, 'W24X229': 229, 'W24X207': 207, 'W24X192': 192,
    'W24X176': 176, 'W24X162': 162, 'W24X146': 146, 'W24X131': 131,
    'W24X117': 117, 'W24X104': 104, 'W24X103': 103, 'W24X94': 94,
    'W24X84': 84, 'W24X76': 76, 'W24X68': 68, 'W24X62': 62,
    'W24X55': 55,
    // W21
    'W21X201': 201, 'W21X182': 182, 'W21X166': 166, 'W21X147': 147,
    'W21X132': 132, 'W21X122': 122, 'W21X111': 111, 'W21X101': 101,
    'W21X93': 93, 'W21X83': 83, 'W21X73': 73, 'W21X68': 68,
    'W21X62': 62, 'W21X55': 55, 'W21X48': 48, 'W21X44': 44,
    // W18
    'W18X311': 311, 'W18X283': 283, 'W18X258': 258, 'W18X234': 234,
    'W18X211': 211, 'W18X192': 192, 'W18X175': 175, 'W18X158': 158,
    'W18X143': 143, 'W18X130': 130, 'W18X119': 119, 'W18X106': 106,
    'W18X97': 97, 'W18X86': 86, 'W18X76': 76, 'W18X71': 71,
    'W18X65': 65, 'W18X60': 60, 'W18X55': 55, 'W18X50': 50,
    'W18X46': 46, 'W18X40': 40, 'W18X35': 35,
    // W16
    'W16X100': 100, 'W16X89': 89, 'W16X77': 77, 'W16X67': 67,
    'W16X57': 57, 'W16X50': 50, 'W16X45': 45, 'W16X40': 40,
    'W16X36': 36, 'W16X31': 31, 'W16X26': 26,
    // W14
    'W14X730': 730, 'W14X665': 665, 'W14X605': 605, 'W14X550': 550,
    'W14X500': 500, 'W14X455': 455, 'W14X426': 426, 'W14X398': 398,
    'W14X370': 370, 'W14X342': 342, 'W14X311': 311, 'W14X283': 283,
    'W14X257': 257, 'W14X233': 233, 'W14X211': 211, 'W14X193': 193,
    'W14X176': 176, 'W14X159': 159, 'W14X145': 145, 'W14X132': 132,
    'W14X120': 120, 'W14X109': 109, 'W14X99': 99, 'W14X90': 90,
    'W14X82': 82, 'W14X74': 74, 'W14X68': 68, 'W14X61': 61,
    'W14X53': 53, 'W14X48': 48, 'W14X43': 43, 'W14X38': 38,
    'W14X34': 34, 'W14X30': 30, 'W14X26': 26, 'W14X22': 22,
    // W12
    'W12X336': 336, 'W12X305': 305, 'W12X279': 279, 'W12X252': 252,
    'W12X230': 230, 'W12X210': 210, 'W12X190': 190, 'W12X170': 170,
    'W12X152': 152, 'W12X136': 136, 'W12X120': 120, 'W12X106': 106,
    'W12X96': 96, 'W12X87': 87, 'W12X79': 79, 'W12X72': 72,
    'W12X65': 65, 'W12X58': 58, 'W12X53': 53, 'W12X50': 50,
    'W12X45': 45, 'W12X40': 40, 'W12X35': 35, 'W12X30': 30,
    'W12X26': 26, 'W12X22': 22, 'W12X19': 19, 'W12X16': 16,
    'W12X14': 14,
    // W10
    'W10X112': 112, 'W10X100': 100, 'W10X88': 88, 'W10X77': 77,
    'W10X68': 68, 'W10X60': 60, 'W10X54': 54, 'W10X49': 49,
    'W10X45': 45, 'W10X39': 39, 'W10X33': 33, 'W10X30': 30,
    'W10X26': 26, 'W10X22': 22, 'W10X19': 19, 'W10X17': 17,
    'W10X15': 15, 'W10X12': 12,
    // W8
    'W8X67': 67, 'W8X58': 58, 'W8X48': 48, 'W8X40': 40,
    'W8X35': 35, 'W8X31': 31, 'W8X28': 28, 'W8X24': 24,
    'W8X21': 21, 'W8X18': 18, 'W8X15': 15, 'W8X13': 13,
    'W8X10': 10,
    // W6
    'W6X25': 25, 'W6X20': 20, 'W6X15': 15, 'W6X16': 16,
    'W6X12': 12, 'W6X9': 9, 'W6X8.5': 8.5,
    // W5
    'W5X19': 19, 'W5X16': 16,
    // W4
    'W4X13': 13
  };

  // HSS Square/Rectangular Tubes - weight in lbs/ft
  const HSS_SHAPES = {
    // HSS Square
    'HSS20X20X5/8': 103.3, 'HSS20X20X1/2': 83.48, 'HSS20X20X3/8': 63.36,
    'HSS16X16X5/8': 82.31, 'HSS16X16X1/2': 67.82, 'HSS16X16X3/8': 51.54,
    'HSS14X14X5/8': 71.81, 'HSS14X14X1/2': 59.32, 'HSS14X14X3/8': 45.24,
    'HSS12X12X5/8': 61.31, 'HSS12X12X1/2': 50.81, 'HSS12X12X3/8': 38.93,
    'HSS12X12X5/16': 32.63, 'HSS12X12X1/4': 26.32,
    'HSS10X10X5/8': 50.81, 'HSS10X10X1/2': 42.30, 'HSS10X10X3/8': 32.63,
    'HSS10X10X5/16': 27.48, 'HSS10X10X1/4': 22.32, 'HSS10X10X3/16': 16.96,
    'HSS8X8X5/8': 40.31, 'HSS8X8X1/2': 33.80, 'HSS8X8X3/8': 26.32,
    'HSS8X8X5/16': 22.32, 'HSS8X8X1/4': 18.19, 'HSS8X8X3/16': 13.91,
    'HSS6X6X5/8': 29.81, 'HSS6X6X1/2': 25.29, 'HSS6X6X3/8': 20.02,
    'HSS6X6X5/16': 17.08, 'HSS6X6X1/4': 14.05, 'HSS6X6X3/16': 10.84,
    'HSS6X6X1/8': 7.31,
    'HSS5X5X1/2': 20.78, 'HSS5X5X3/8': 16.71, 'HSS5X5X5/16': 14.31,
    'HSS5X5X1/4': 11.97, 'HSS5X5X3/16': 9.22, 'HSS5X5X1/8': 6.26,
    'HSS4X4X1/2': 16.27, 'HSS4X4X3/8': 13.41, 'HSS4X4X5/16': 11.54,
    'HSS4X4X1/4': 9.72, 'HSS4X4X3/16': 7.59, 'HSS4X4X1/8': 5.21,
    'HSS3X3X3/8': 10.10, 'HSS3X3X5/16': 8.77, 'HSS3X3X1/4': 7.47,
    'HSS3X3X3/16': 5.90, 'HSS3X3X1/8': 4.11,
    // HSS Rectangular (common sizes)
    'HSS12X8X1/2': 45.02, 'HSS12X8X3/8': 35.13, 'HSS12X8X5/16': 29.63,
    'HSS12X6X1/2': 40.35, 'HSS12X6X3/8': 31.84, 'HSS12X6X5/16': 26.93,
    'HSS10X6X1/2': 35.35, 'HSS10X6X3/8': 28.03, 'HSS10X6X5/16': 23.77,
    'HSS10X4X1/2': 30.35, 'HSS10X4X3/8': 24.23, 'HSS10X4X5/16': 20.62,
    'HSS8X6X1/2': 30.35, 'HSS8X6X3/8': 24.23, 'HSS8X6X5/16': 20.62,
    'HSS8X4X1/2': 25.35, 'HSS8X4X3/8': 20.42, 'HSS8X4X5/16': 17.47,
    'HSS6X4X1/2': 20.35, 'HSS6X4X3/8': 16.61, 'HSS6X4X5/16': 14.31,
    'HSS6X3X1/2': 17.85, 'HSS6X3X3/8': 14.71, 'HSS6X3X5/16': 12.70
  };

  // Pipe (standard weight) - weight in lbs/ft
  const PIPE_SHAPES = {
    'PIPE12STD': 49.56, 'PIPE12XS': 65.42,
    'PIPE10STD': 40.48, 'PIPE10XS': 54.74,
    'PIPE8STD': 28.55, 'PIPE8XS': 43.39,
    'PIPE6STD': 18.97, 'PIPE6XS': 28.57,
    'PIPE5STD': 14.62, 'PIPE5XS': 20.78,
    'PIPE4STD': 10.79, 'PIPE4XS': 14.98,
    'PIPE3-1/2STD': 9.11, 'PIPE3-1/2XS': 12.50,
    'PIPE3STD': 7.58, 'PIPE3XS': 10.25,
    'PIPE2-1/2STD': 5.79, 'PIPE2-1/2XS': 7.66,
    'PIPE2STD': 3.65, 'PIPE2XS': 5.02,
    'PIPE1-1/2STD': 2.72, 'PIPE1-1/2XS': 3.63,
    'PIPE1-1/4STD': 2.27, 'PIPE1-1/4XS': 3.00,
    'PIPE1STD': 1.68, 'PIPE1XS': 2.17
  };

  // Angles (equal leg) - weight in lbs/ft
  const ANGLE_SHAPES = {
    'L8X8X1-1/8': 56.9, 'L8X8X1': 51.0, 'L8X8X7/8': 45.0,
    'L8X8X3/4': 38.9, 'L8X8X5/8': 32.7, 'L8X8X1/2': 26.4,
    'L6X6X1': 37.4, 'L6X6X7/8': 33.1, 'L6X6X3/4': 28.7,
    'L6X6X5/8': 24.2, 'L6X6X1/2': 19.6, 'L6X6X3/8': 14.9,
    'L5X5X7/8': 27.2, 'L5X5X3/4': 23.6, 'L5X5X5/8': 20.0,
    'L5X5X1/2': 16.2, 'L5X5X3/8': 12.3, 'L5X5X5/16': 10.3,
    'L4X4X3/4': 18.5, 'L4X4X5/8': 15.7, 'L4X4X1/2': 12.8,
    'L4X4X3/8': 9.8, 'L4X4X5/16': 8.2, 'L4X4X1/4': 6.6,
    'L3-1/2X3-1/2X1/2': 11.1, 'L3-1/2X3-1/2X3/8': 8.5,
    'L3-1/2X3-1/2X5/16': 7.2, 'L3-1/2X3-1/2X1/4': 5.8,
    'L3X3X1/2': 9.4, 'L3X3X3/8': 7.2, 'L3X3X5/16': 6.1,
    'L3X3X1/4': 4.9, 'L3X3X3/16': 3.71,
    'L2-1/2X2-1/2X1/2': 7.7, 'L2-1/2X2-1/2X3/8': 5.9,
    'L2-1/2X2-1/2X5/16': 5.0, 'L2-1/2X2-1/2X1/4': 4.1,
    'L2-1/2X2-1/2X3/16': 3.07,
    'L2X2X3/8': 4.7, 'L2X2X5/16': 3.92, 'L2X2X1/4': 3.19,
    'L2X2X3/16': 2.44, 'L2X2X1/8': 1.65
  };

  // Channels - weight in lbs/ft
  const CHANNEL_SHAPES = {
    'C15X50': 50, 'C15X40': 40, 'C15X33.9': 33.9,
    'C12X30': 30, 'C12X25': 25, 'C12X20.7': 20.7,
    'C10X30': 30, 'C10X25': 25, 'C10X20': 20, 'C10X15.3': 15.3,
    'C9X20': 20, 'C9X15': 15, 'C9X13.4': 13.4,
    'C8X18.75': 18.75, 'C8X13.75': 13.75, 'C8X11.5': 11.5,
    'C7X14.75': 14.75, 'C7X12.25': 12.25, 'C7X9.8': 9.8,
    'C6X13': 13, 'C6X10.5': 10.5, 'C6X8.2': 8.2,
    'C5X9': 9, 'C5X6.7': 6.7,
    'C4X7.25': 7.25, 'C4X5.4': 5.4,
    'C3X6': 6, 'C3X5': 5, 'C3X4.1': 4.1,
    // MC Channels
    'MC18X58': 58, 'MC18X51.9': 51.9, 'MC18X45.8': 45.8, 'MC18X42.7': 42.7,
    'MC13X50': 50, 'MC13X40': 40, 'MC13X35': 35, 'MC13X31.8': 31.8,
    'MC12X50': 50, 'MC12X45': 45, 'MC12X40': 40, 'MC12X35': 35,
    'MC12X31': 31, 'MC12X10.6': 10.6,
    'MC10X41.1': 41.1, 'MC10X33.6': 33.6, 'MC10X28.5': 28.5,
    'MC10X25': 25, 'MC10X22': 22, 'MC10X8.4': 8.4,
    'MC8X22.8': 22.8, 'MC8X21.4': 21.4, 'MC8X20': 20, 'MC8X18.7': 18.7,
    'MC8X8.5': 8.5,
    'MC6X18': 18, 'MC6X15.3': 15.3, 'MC6X12': 12
  };

  // WT Shapes (Structural Tees) - weight in lbs/ft
  const WT_SHAPES = {
    'WT18X150': 150, 'WT18X128': 128, 'WT18X116': 116, 'WT18X105': 105,
    'WT18X97': 97, 'WT18X91': 91, 'WT18X85': 85, 'WT18X80': 80,
    'WT18X75': 75, 'WT18X67.5': 67.5,
    'WT15X195.5': 195.5, 'WT15X178.5': 178.5, 'WT15X163': 163,
    'WT15X146': 146, 'WT15X130.5': 130.5, 'WT15X117.5': 117.5,
    'WT15X105.5': 105.5, 'WT15X95.5': 95.5, 'WT15X86.5': 86.5,
    'WT12X185': 185, 'WT12X167.5': 167.5, 'WT12X153': 153,
    'WT12X140': 140, 'WT12X125': 125, 'WT12X114.5': 114.5,
    'WT12X103.5': 103.5, 'WT12X96': 96, 'WT12X88': 88,
    'WT12X81': 81, 'WT12X73': 73, 'WT12X65.5': 65.5,
    'WT12X58.5': 58.5, 'WT12X52': 52, 'WT12X47': 47,
    'WT12X42': 42, 'WT12X38': 38, 'WT12X34': 34,
    'WT9X87.5': 87.5, 'WT9X79': 79, 'WT9X71.5': 71.5,
    'WT9X65': 65, 'WT9X59.5': 59.5, 'WT9X53': 53,
    'WT9X48.5': 48.5, 'WT9X43': 43, 'WT9X38': 38,
    'WT9X35.5': 35.5, 'WT9X32.5': 32.5, 'WT9X30': 30,
    'WT9X27.5': 27.5, 'WT9X25': 25, 'WT9X23': 23, 'WT9X20': 20,
    'WT7X404': 404, 'WT7X365': 365, 'WT7X332.5': 332.5,
    'WT7X302.5': 302.5, 'WT7X275': 275, 'WT7X250': 250,
    'WT7X227.5': 227.5, 'WT7X213': 213, 'WT7X199': 199,
    'WT7X185': 185, 'WT7X171': 171, 'WT7X155.5': 155.5
  };

  /**
   * Parse a member designation string and find its weight
   * @param {string} designation - e.g., "W12X26", "HSS6X6X1/4", "L4X4X1/4"
   * @returns {object} { type, size, weight, valid }
   */
  function parseMember(designation) {
    if (!designation) return { valid: false };

    // Normalize the input
    let normalized = designation
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/×/g, 'X')  // Unicode multiplication sign
      .replace(/"/g, '')   // Remove inch marks
      .trim();

    // Try to match against databases
    let type = null;
    let weight = null;

    // Check W shapes
    if (normalized.startsWith('W') && W_SHAPES[normalized]) {
      type = 'W';
      weight = W_SHAPES[normalized];
    }
    // Check HSS
    else if (normalized.startsWith('HSS') && HSS_SHAPES[normalized]) {
      type = 'HSS';
      weight = HSS_SHAPES[normalized];
    }
    // Check Pipe
    else if (normalized.startsWith('PIPE') && PIPE_SHAPES[normalized]) {
      type = 'PIPE';
      weight = PIPE_SHAPES[normalized];
    }
    // Check Angles
    else if (normalized.startsWith('L') && ANGLE_SHAPES[normalized]) {
      type = 'L';
      weight = ANGLE_SHAPES[normalized];
    }
    // Check Channels
    else if ((normalized.startsWith('C') || normalized.startsWith('MC')) && CHANNEL_SHAPES[normalized]) {
      type = normalized.startsWith('MC') ? 'MC' : 'C';
      weight = CHANNEL_SHAPES[normalized];
    }
    // Check WT shapes
    else if (normalized.startsWith('WT') && WT_SHAPES[normalized]) {
      type = 'WT';
      weight = WT_SHAPES[normalized];
    }

    // Try fuzzy match if exact match failed
    if (!weight) {
      const fuzzyResult = fuzzyMatch(normalized);
      if (fuzzyResult) {
        type = fuzzyResult.type;
        weight = fuzzyResult.weight;
        normalized = fuzzyResult.matched;
      }
    }

    return {
      valid: weight !== null,
      type: type,
      size: normalized,
      weight: weight,  // lbs/ft
      originalInput: designation
    };
  }

  /**
   * Fuzzy match for common variations
   */
  function fuzzyMatch(input) {
    // Handle variations like "W12 X 26" or "W12-26"
    const wMatch = input.match(/^W(\d+)[X\-\s]*(\d+\.?\d*)$/);
    if (wMatch) {
      const key = `W${wMatch[1]}X${wMatch[2]}`;
      if (W_SHAPES[key]) {
        return { type: 'W', weight: W_SHAPES[key], matched: key };
      }
    }

    // Handle HSS variations
    const hssMatch = input.match(/^HSS(\d+)[X\-](\d+)[X\-](\d+\/?\d*)/);
    if (hssMatch) {
      const key = `HSS${hssMatch[1]}X${hssMatch[2]}X${hssMatch[3]}`;
      if (HSS_SHAPES[key]) {
        return { type: 'HSS', weight: HSS_SHAPES[key], matched: key };
      }
    }

    return null;
  }

  /**
   * Get all shapes of a specific type
   */
  function getShapesByType(type) {
    switch (type.toUpperCase()) {
      case 'W': return Object.keys(W_SHAPES);
      case 'HSS': return Object.keys(HSS_SHAPES);
      case 'PIPE': return Object.keys(PIPE_SHAPES);
      case 'L': case 'ANGLE': return Object.keys(ANGLE_SHAPES);
      case 'C': case 'MC': case 'CHANNEL': return Object.keys(CHANNEL_SHAPES);
      case 'WT': return Object.keys(WT_SHAPES);
      default: return [];
    }
  }

  /**
   * Search for shapes matching a pattern
   * @param {string} pattern - Search pattern
   * @param {number} limit - Max results (default 20)
   */
  function searchShapes(pattern, limit = 20) {
    const regex = new RegExp(pattern.toUpperCase().replace(/X/g, 'X?'));
    const results = [];

    const allShapes = {
      ...W_SHAPES, ...HSS_SHAPES, ...PIPE_SHAPES,
      ...ANGLE_SHAPES, ...CHANNEL_SHAPES, ...WT_SHAPES
    };

    for (const [shape, weight] of Object.entries(allShapes)) {
      if (regex.test(shape)) {
        results.push({ shape, weight });
      }
    }

    return results.slice(0, limit);
  }

  // Public API
  return {
    parseMember,
    getShapesByType,
    searchShapes,
    W_SHAPES,
    HSS_SHAPES,
    PIPE_SHAPES,
    ANGLE_SHAPES,
    CHANNEL_SHAPES,
    WT_SHAPES
  };
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.SteelDatabase = SteelDatabase;
}
