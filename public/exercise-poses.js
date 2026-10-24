/** Original articulated poses for eboji's home exercise library.
 * Coordinates describe a schematic movement, not personalised form assessment.
 * Every exercise has an explicit sequence; holds intentionally do not oscillate.
 */
const P = (base, changes = {}) => ({ ...base, ...changes });
const stand = { head:[180,42], neck:[180,63], ls:[157,76], rs:[203,76], le:[150,111], re:[210,111], lw:[147,146], rw:[213,146], lh:[165,150], rh:[195,150], lk:[164,201], rk:[196,201], la:[162,247], ra:[198,247] };
const side = { head:[151,43], neck:[153,65], ls:[150,78], rs:[160,80], le:[148,116], re:[169,116], lw:[147,150], rw:[174,150], lh:[160,151], rh:[170,153], lk:[157,200], rk:[181,203], la:[155,247], ra:[187,247] };
const squat = P(stand,{head:[180,95],neck:[180,116],ls:[156,124],rs:[204,124],le:[143,151],re:[217,151],lw:[169,147],rw:[191,147],lh:[161,187],rh:[199,187],lk:[139,214],rk:[221,214],la:[147,247],ra:[213,247]});
const squatStand = P(stand,{lk:[155,201],rk:[205,201],la:[147,247],ra:[213,247]});
const wide = P(stand,{lk:[142,204],rk:[218,204],la:[126,247],ra:[234,247]});
const sumo = P(squat,{lh:[157,183],rh:[203,183],lk:[123,210],rk:[237,210],la:[126,247],ra:[234,247]});
const split = P(side,{lk:[122,203],rk:[215,197],la:[104,247],ra:[239,247]});
const splitLow = P(split,{head:[148,93],neck:[150,114],ls:[148,125],rs:[158,127],le:[143,161],re:[169,161],lw:[142,197],rw:[174,197],lh:[153,187],rh:[163,189],lk:[106,197],rk:[212,237]});
const lungeLow = P(splitLow,{la:[101,247],ra:[241,247],lk:[103,199],rk:[217,238]});
const shift = (pose,x,y=0) => Object.fromEntries(Object.entries(pose).map(([key,[px,py]]) => [key,[px+x,py+y]]));
const reverseLow = shift(lungeLow,54);
const forwardLow = P(shift(lungeLow,-40),{ra:[187,247],rk:[177,238]});
const sideLunge = P(wide,{head:[139,79],neck:[143,100],ls:[125,115],rs:[165,115],le:[130,145],re:[180,142],lw:[158,136],rw:[165,136],lh:[133,178],rh:[165,178],lk:[104,211],rk:[212,209],la:[99,247],ra:[257,247]});
const hinge = P(side,{head:[105,120],neck:[126,131],ls:[138,137],rs:[146,143],le:[141,171],re:[152,177],lw:[143,207],rw:[155,213],lh:[204,162],rh:[211,167],lk:[184,205],rk:[198,210],la:[175,247],ra:[195,247]});
const supine = {head:[69,243],neck:[91,245],ls:[105,241],rs:[112,247],le:[139,249],re:[144,251],lw:[172,249],rw:[179,251],lh:[185,241],rh:[194,247],lk:[227,190],rk:[237,199],la:[251,247],ra:[266,249]};
const bridge = P(supine,{lh:[181,209],rh:[190,217],lk:[228,190],rk:[238,199]});
const quadruped = {head:[81,133],neck:[101,143],ls:[116,149],rs:[126,156],le:[113,193],re:[131,198],lw:[108,245],rw:[135,249],lh:[204,152],rh:[215,159],lk:[211,236],rk:[224,242],la:[264,241],ra:[277,247]};
const push = {head:[73,132],neck:[94,142],ls:[108,150],rs:[117,156],le:[104,194],re:[121,202],lw:[104,245],rw:[129,249],lh:[192,184],rh:[202,190],lk:[241,215],rk:[252,220],la:[290,245],ra:[303,248]};
const pushLow = P(push,{head:[70,194],neck:[92,201],ls:[106,207],rs:[117,214],le:[141,235],re:[151,242],lh:[191,222],rh:[201,228],lk:[241,234],rk:[252,240]});
const kneePush = P(push,{lh:[181,180],rh:[192,187],lk:[222,243],rk:[235,249],la:[265,205],ra:[279,212]});
const kneePushLow = P(pushLow,{lh:[180,224],rh:[191,231],lk:[222,243],rk:[235,249],la:[265,205],ra:[279,212]});
const top = {head:[180,64],neck:[180,86],ls:[157,97],rs:[203,97],le:[142,133],re:[218,133],lw:[144,173],rw:[216,173],lh:[164,168],rh:[196,168],lk:[162,211],rk:[198,211],la:[159,251],ra:[201,251]};
const curl = P(stand,{le:[149,113],re:[211,113],lw:[158,79],rw:[202,79]});
const pressLow = P(stand,{le:[132,110],re:[228,110],lw:[132,69],rw:[228,69]});
const pressHigh = P(stand,{le:[147,47],re:[213,47],lw:[153,20],rw:[207,20]});
const floorPressLow = P(supine,{le:[137,249],re:[164,249],lw:[136,197],rw:[164,197]});
const floorPressHigh = P(supine,{le:[106,196],re:[125,202],lw:[106,151],rw:[125,157]});
const sideLie = {head:[80,200],neck:[99,202],ls:[112,203],rs:[118,197],le:[99,227],re:[146,215],lw:[69,226],rw:[159,245],lh:[186,217],rh:[188,211],lk:[244,229],rk:[244,221],la:[302,242],ra:[303,233]};
const march = P(stand,{lk:[140,178],la:[141,222],le:[147,104],lw:[163,86],re:[219,116],rw:[225,145]});
const deadbug = P(supine,{le:[108,196],re:[125,202],lw:[108,151],rw:[125,157],lk:[188,187],rk:[203,195],la:[242,187],ra:[258,195]});
const child = {head:[84,217],neck:[105,211],ls:[121,202],rs:[132,209],le:[80,222],re:[92,230],lw:[40,239],rw:[51,247],lh:[220,193],rh:[231,201],lk:[190,239],rk:[201,247],la:[250,242],ra:[262,248]};
const phase = (label, pose) => ({ label, pose });
const spec = (id, phases, options = {}) => ({id,viewBox:'0 0 360 280',duration:3600,hold:false,view:'side',equipment:'bodyweight',...options,phases});
const dumb = {equipment:'dumbbells'};
const front = {view:'front'};
const frontDB = {...front,...dumb};
const plankElbows = P(push,{ls:[110,180],rs:[121,185],le:[111,237],re:[124,245],lw:[64,240],rw:[77,248],head:[75,159],neck:[95,170],lh:[194,204],rh:[204,210],lk:[242,225],rk:[252,232]});
const sidePlank = {head:[84,128],neck:[103,141],ls:[118,148],rs:[125,137],le:[119,238],re:[145,108],lw:[75,242],rw:[166,76],lh:[191,188],rh:[196,179],lk:[242,219],rk:[247,210],la:[294,247],ra:[299,238]};
const crunch = P(supine,{head:[95,198],neck:[112,216],ls:[127,225],rs:[136,232],le:[116,191],re:[143,204],lw:[86,190],rw:[110,203]});
const crunchRest = P(supine,{le:[104,211],re:[125,221],lw:[64,236],rw:[87,244]});
const reverseCrunch = P(supine,{lh:[178,214],rh:[188,222],lk:[159,171],rk:[171,180],la:[211,171],ra:[224,180]});
const seated = {head:[132,98],neck:[141,120],ls:[134,135],rs:[163,129],le:[161,162],re:[188,154],lw:[190,168],rw:[199,163],lh:[167,211],rh:[185,207],lk:[230,194],rk:[243,198],la:[270,244],ra:[285,247]};

export const EXERCISE_ANIMATIONS = Object.freeze([
  spec('bodyweight-squat',[phase('站稳，脚跟踩实',squatStand),phase('屈髋屈膝，下蹲',squat),phase('蹬地站起',squatStand)],front),
  spec('sumo-squat',[phase('宽站距，脚尖微外展',wide),phase('膝盖沿脚尖方向下蹲',sumo),phase('蹬地回到站姿',wide)],front),
  spec('split-squat',[phase('前后分腿站稳',split),phase('身体垂直下沉',splitLow),phase('前脚发力站起',split)],{...front,view:'side'}),
  spec('reverse-lunge',[phase('双脚站稳',side),phase('向后迈步并下沉',reverseLow),phase('前脚发力收回后脚',side)]),
  spec('forward-lunge',[phase('双脚站稳',side),phase('向前迈步并下沉',forwardLow),phase('前脚蹬地回起点',side)]),
  spec('lateral-lunge',[phase('双脚宽站',wide),phase('向一侧屈髋，另一腿伸直',sideLunge),phase('蹬地回正，换侧完成',wide)],front),
  spec('calf-raise',[phase('站稳，脚掌踩地',stand),phase('双脚提踵',P(stand,{head:[180,29],neck:[180,50],ls:[157,63],rs:[203,63],le:[150,98],re:[210,98],lw:[147,133],rw:[213,133],lh:[165,137],rh:[195,137],lk:[164,188],rk:[196,188],la:[162,234],ra:[198,234]})),phase('缓慢落下脚跟',stand)],{...front,toes:true}),
  spec('single-leg-calf-raise',[phase('扶墙，单脚站稳',P(stand,{rw:[272,99],re:[236,100],rk:[209,193],ra:[228,221]})),phase('支撑脚提踵',P(stand,{head:[180,31],neck:[180,52],ls:[157,65],rs:[203,65],le:[150,100],re:[236,89],lw:[147,135],rw:[272,99],lh:[165,139],rh:[195,139],lk:[164,190],la:[162,236],rk:[209,182],ra:[228,210]}))],{...front,wall:280,toes:'l'}),
  spec('goblet-squat',[phase('胸前抱住一只哑铃',P(squatStand,{le:[148,112],re:[212,112],lw:[177,89],rw:[183,89]})),phase('抱铃下蹲',P(squat,{le:[147,159],re:[213,159],lw:[177,132],rw:[183,132]})),phase('蹬地站起',P(squatStand,{le:[148,112],re:[212,112],lw:[177,89],rw:[183,89]}))],{...frontDB,weights:'goblet'}),
  spec('dumbbell-squat',[phase('双手持铃自然垂下',squatStand),phase('持铃于身体两侧下蹲',P(squat,{le:[145,161],re:[215,161],lw:[139,198],rw:[221,198]})),phase('脚跟踩稳站起',squatStand)],frontDB),
  spec('dumbbell-sumo-squat',[phase('宽站距，双手垂握一只铃',P(wide,{le:[162,115],re:[198,115],lw:[177,151],rw:[183,151]})),phase('哑铃沿身体中线下降',P(sumo,{le:[159,165],re:[201,165],lw:[177,202],rw:[183,202]}))],{...frontDB,weights:'single-center'}),
  spec('dumbbell-split-squat',[phase('分腿站稳，双手持铃',split),phase('屈膝垂直下沉',splitLow),phase('前脚发力回升',split)],dumb),
  spec('dumbbell-reverse-lunge',[phase('双手持铃站稳',side),phase('后撤一步，控制下沉',reverseLow),phase('收回后脚',side)],dumb),
  spec('dumbbell-lateral-lunge',[phase('宽站距，持铃于身前',P(wide,{lw:[164,153],rw:[196,153]})),phase('向一侧坐髋，铃随身体下移',P(sideLunge,{le:[130,155],re:[172,155],lw:[132,194],rw:[175,194]})),phase('回到中央',P(wide,{lw:[164,153],rw:[196,153]}))],frontDB),
  spec('dumbbell-calf-raise',[phase('双手持铃站稳',stand),phase('提起脚跟，保持平衡',P(stand,{head:[180,30],neck:[180,51],ls:[157,64],rs:[203,64],le:[150,99],re:[210,99],lw:[147,134],rw:[213,134],lh:[165,138],rh:[195,138],lk:[164,189],rk:[196,189],la:[162,235],ra:[198,235]}))],{...frontDB,toes:true}),
  spec('glute-bridge',[phase('仰卧屈膝，脚掌踩地',supine),phase('抬髋至肩髋膝大致成线',bridge),phase('控制落下',supine)]),
  spec('single-leg-glute-bridge',[phase('单脚踩地，另一腿抬起',P(supine,{rk:[237,209],ra:[280,178]})),phase('支撑脚发力抬髋',P(bridge,{rk:[232,190],ra:[271,166]})),phase('保持骨盆稳定落下',P(supine,{rk:[237,209],ra:[280,178]}))]),
  spec('frog-pump',[phase('仰卧脚底相对，双膝打开',P(supine,{lk:[225,214],rk:[229,252],la:[267,246],ra:[269,250]})),phase('脚跟相贴，轻抬髋',P(bridge,{lk:[225,196],rk:[232,235],la:[267,246],ra:[269,250]}))],{view:'oblique'}),
  spec('quadruped-hip-extension',[phase('四点支撑',quadruped),phase('屈膝向后抬腿',P(quadruped,{rk:[271,151],ra:[273,102]})),phase('回到起点',quadruped)]),
  spec('fire-hydrant',[phase('四点支撑，躯干稳定',quadruped),phase('保持屈膝，向外侧打开',P(quadruped,{rk:[249,194],ra:[290,205]})),phase('缓慢收回膝盖',quadruped)],{view:'oblique'}),
  spec('side-lying-leg-raise',[phase('侧卧，双腿伸直',sideLie),phase('上侧腿向上抬起',P(sideLie,{rk:[241,174],ra:[293,137]})),phase('缓慢放下',sideLie)]),
  spec('clamshell',[phase('侧卧屈膝，脚跟相贴',P(sideLie,{lk:[231,246],rk:[230,235],la:[282,243],ra:[282,238]})),phase('保持脚跟相贴，打开上侧膝',P(sideLie,{lk:[231,246],rk:[230,175],la:[282,243],ra:[282,238]}))],{view:'oblique'}),
  spec('bodyweight-good-morning',[phase('双手放胸前站稳',P(side,{le:[125,108],re:[146,114],lw:[148,91],rw:[165,96]})),phase('膝微屈，臀部向后推',P(hinge,{le:[115,158],re:[136,169],lw:[135,141],rw:[151,149]})),phase('伸髋回站姿',P(side,{le:[125,108],re:[146,114],lw:[148,91],rw:[165,96]}))]),
  spec('dumbbell-rdl',[phase('持铃站立，膝盖微屈',side),phase('髋部后推，铃贴近双腿',hinge),phase('伸髋回到站姿',side)],dumb),
  spec('dumbbell-deadlift',[phase('持铃站直',side),phase('屈髋屈膝，哑铃降至小腿旁',P(hinge,{head:[112,131],neck:[131,145],ls:[140,155],rs:[151,160],le:[139,192],re:[155,197],lw:[138,229],rw:[159,234],lh:[192,191],rh:[202,197],lk:[144,216],rk:[160,223]})),phase('双脚蹬地站起',side)],dumb),
  spec('dumbbell-single-leg-rdl',[phase('单脚承重，后脚轻离地',P(side,{rk:[202,199],ra:[218,237]})),phase('髋后推，后腿与躯干延伸',P(hinge,{rk:[261,158],ra:[314,152]})),phase('控制回到站姿',P(side,{rk:[202,199],ra:[218,237]}))],{...dumb,weights:'right'}),
  spec('dumbbell-glute-bridge',[phase('哑铃置于髋部，双手扶稳',P(supine,{le:[140,231],re:[151,238],lw:[182,235],rw:[195,239]})),phase('脚跟发力抬髋',P(bridge,{le:[143,222],re:[155,231],lw:[179,206],rw:[194,213]}))],{...dumb,weights:'hip'}),
  spec('wall-push-up',[phase('双手撑墙，身体成直线',{head:[167,52],neck:[181,71],ls:[190,82],rs:[198,87],le:[227,93],re:[235,102],lw:[269,104],rw:[269,116],lh:[157,150],rh:[164,155],lk:[137,201],rk:[149,204],la:[119,247],ra:[135,249]}),phase('屈肘，胸部向墙靠近',{head:[213,77],neck:[220,96],ls:[229,106],rs:[236,112],le:[239,143],re:[248,153],lw:[269,104],rw:[269,116],lh:[178,167],rh:[185,174],lk:[150,210],rk:[160,215],la:[119,247],ra:[135,249]})],{wall:280}),
  spec('knee-push-up',[phase('屈膝支撑，肩髋膝成线',kneePush),phase('屈肘，胸部下降',kneePushLow),phase('推地回到支撑',kneePush)]),
  spec('push-up',[phase('直臂支撑，身体成线',push),phase('屈肘下降',pushLow),phase('推地撑起',push)]),
  spec('close-grip-push-up',[phase('双手略窄于肩',P(push,{lw:[116,244],rw:[121,249],le:[111,194],re:[119,202]})),phase('手肘靠近身体下降',P(pushLow,{lw:[116,244],rw:[121,249],le:[146,221],re:[152,228]})),phase('保持身体成线撑起',P(push,{lw:[116,244],rw:[121,249],le:[111,194],re:[119,202]}))]),
  spec('dumbbell-floor-press',[phase('仰卧，上臂轻触地面',floorPressLow),phase('将哑铃向上推起',floorPressHigh),phase('缓慢下放',floorPressLow)],dumb),
  spec('dumbbell-floor-squeeze-press',[phase('哑铃靠拢于胸前',P(floorPressLow,{le:[137,249],re:[145,253],lw:[119,204],rw:[131,205]})),phase('保持哑铃相靠向上推',P(floorPressHigh,{lw:[111,151],rw:[124,151],le:[111,196],re:[124,196]}))],dumb),
  spec('prone-w-raise',[phase('俯卧，手臂摆成 W 形',P(top,{le:[124,121],re:[236,121],lw:[129,77],rw:[231,77]})),phase('轻收肩胛，手臂离地',P(top,{head:[180,59],neck:[180,81],ls:[158,92],rs:[202,92],le:[120,113],re:[240,113],lw:[126,69],rw:[234,69]}))],{view:'top',lift:true}),
  spec('prone-y-raise',[phase('俯卧，手臂向前呈 Y 形',P(top,{le:[130,65],re:[230,65],lw:[107,34],rw:[253,34]})),phase('肩胛稳定，双臂轻抬',P(top,{head:[180,59],neck:[180,81],ls:[158,92],rs:[202,92],le:[128,58],re:[232,58],lw:[105,27],rw:[255,27]}))],{view:'top',lift:true}),
  spec('reverse-snow-angel',[phase('俯卧，手臂伸向髋旁',P(top,{le:[139,136],re:[221,136],lw:[145,175],rw:[215,175]})),phase('双臂沿侧面扫向肩旁',P(top,{le:[113,99],re:[247,99],lw:[72,100],rw:[288,100]})),phase('扫到头顶，再原路返回',P(top,{le:[135,61],re:[225,61],lw:[155,23],rw:[205,23]}))],{view:'top'}),
  spec('prone-cobra',[phase('俯卧，手臂放身体两侧',{head:[81,227],neck:[104,229],ls:[119,231],rs:[125,236],le:[155,228],re:[166,234],lw:[194,225],rw:[205,231],lh:[200,236],rh:[210,242],lk:[249,240],rk:[261,246],la:[303,244],ra:[315,249]}),phase('轻抬胸口，肩胛向后下收，保持呼吸',{head:[82,210],neck:[103,217],ls:[118,221],rs:[125,228],le:[159,216],re:[170,224],lw:[199,217],rw:[210,225],lh:[200,236],rh:[210,242],lk:[249,240],rk:[261,246],la:[303,244],ra:[315,249]})],{hold:true}),
  spec('dumbbell-bent-over-row',[phase('俯身，双臂自然下垂',hinge),phase('手肘向后，拉铃至髋旁',P(hinge,{le:[184,124],re:[197,132],lw:[183,165],rw:[196,174]})),phase('缓慢放下哑铃',hinge)],dumb),
  spec('dumbbell-single-arm-row',[phase('分腿俯身，空手支撑大腿',P(hinge,{lw:[140,201],le:[136,174],lk:[136,207],la:[121,247],rk:[221,210],ra:[239,247]})),phase('持铃手肘向后划',P(hinge,{lw:[140,201],le:[136,174],lk:[136,207],la:[121,247],rk:[221,210],ra:[239,247],re:[197,132],rw:[196,174]}))],{...dumb,weights:'right'}),
  spec('pike-push-up',[phase('臀部抬高，呈倒 V 形',{head:[110,172],neck:[128,154],ls:[141,143],rs:[151,149],le:[116,195],re:[132,202],lw:[90,245],rw:[107,249],lh:[181,84],rh:[193,91],lk:[231,163],rk:[244,171],la:[280,245],ra:[296,249]}),phase('屈肘，头向双手前方靠近，保持离地',{head:[68,215],neck:[88,202],ls:[106,190],rs:[116,198],le:[130,236],re:[145,241],lw:[90,245],rw:[107,249],lh:[184,119],rh:[196,128],lk:[233,181],rk:[246,188],la:[280,245],ra:[296,249]})]),
  spec('dumbbell-overhead-press',[phase('持铃于肩侧',pressLow),phase('向头顶推起',pressHigh),phase('控制回到肩侧',pressLow)],frontDB),
  spec('dumbbell-arnold-press',[phase('掌心朝向自己，铃在胸前',P(stand,{le:[163,113],re:[197,113],lw:[168,78],rw:[192,78]})),phase('外旋并打开至肩侧',pressLow),phase('继续向头顶推起',pressHigh)],{...frontDB,grip:'rotate'}),
  spec('dumbbell-lateral-raise',[phase('双手持铃垂于两侧',stand),phase('手肘微屈，向两侧抬至肩高',P(stand,{le:[116,75],re:[244,75],lw:[77,80],rw:[283,80]})),phase('缓慢放回两侧',stand)],frontDB),
  spec('dumbbell-front-raise',[phase('持铃站立',side),phase('手臂向前抬至肩高',P(side,{le:[113,80],re:[123,87],lw:[74,83],rw:[83,92]})),phase('缓慢下放',side)],dumb),
  spec('dumbbell-reverse-fly',[phase('俯身，哑铃垂于胸下',P(hinge,{ls:[145,137],rs:[167,143],le:[149,174],re:[174,178],lw:[153,211],rw:[181,217]})),phase('微屈肘，向两侧展开',P(hinge,{ls:[145,137],rs:[167,143],le:[103,122],re:[211,133],lw:[68,132],rw:[248,148]}))],{...dumb,view:'oblique'}),
  spec('dumbbell-biceps-curl',[phase('掌心向前，手臂自然下垂',stand),phase('上臂稳定，弯举至肩前',curl),phase('缓慢伸肘',stand)],frontDB),
  spec('dumbbell-hammer-curl',[phase('掌心相对，中立握铃',stand),phase('保持中立握法弯举',curl),phase('缓慢下放',stand)],{...frontDB,grip:'neutral'}),
  spec('dumbbell-alternating-curl',[phase('双臂自然下垂',stand),phase('一侧弯举，上臂稳定',P(stand,{lw:[158,79]})),phase('放下这一侧',stand),phase('另一侧弯举',P(stand,{rw:[202,79]}))],frontDB),
  spec('dumbbell-cross-body-hammer-curl',[phase('中立握铃站立',stand),phase('一只铃斜向对侧胸前',P(stand,{le:[151,110],lw:[197,92]})),phase('放下后换侧',P(stand,{re:[209,110],rw:[163,92]}))],{...frontDB,grip:'neutral'}),
  spec('dumbbell-overhead-triceps-extension',[phase('双手托铃在头后，上臂固定',P(side,{le:[171,26],re:[181,29],lw:[198,61],rw:[205,65]})),phase('上臂稳定，伸肘举铃',P(side,{le:[171,26],re:[181,29],lw:[175,17],rw:[182,20]})),phase('屈肘回到头后',P(side,{le:[171,26],re:[181,29],lw:[198,61],rw:[205,65]}))],{...dumb,weights:'single-center'}),
  spec('dumbbell-triceps-kickback',[phase('俯身，上臂贴近躯干',P(hinge,{le:[184,131],re:[196,138],lw:[185,169],rw:[198,178]})),phase('保持上臂，向后伸直手肘',P(hinge,{le:[184,131],re:[196,138],lw:[225,127],rw:[238,135]}))],dumb),
  spec('dumbbell-floor-triceps-extension',[phase('仰卧，双臂朝上',floorPressHigh),phase('上臂固定，屈肘向头旁下放',P(floorPressHigh,{lw:[65,185],rw:[80,193]})),phase('伸肘回到起点',floorPressHigh)],dumb),
  spec('forearm-plank',[phase('前臂撑地，膝盖先落地准备',P(plankElbows,{lh:[183,201],rh:[193,207],lk:[225,243],rk:[238,249],la:[267,207],ra:[281,213]})),phase('前臂支撑，头髋脚跟成线，保持呼吸',plankElbows)],{hold:true}),
  spec('high-plank',[phase('双手撑地，膝盖落地准备',quadruped),phase('双手在肩下，身体成线，保持呼吸',push)],{hold:true}),
  spec('knee-plank',[phase('前臂和膝盖着地，臀部向后准备',P(quadruped,{head:[79,169],neck:[100,180],ls:[115,190],rs:[125,197],le:[111,237],re:[124,245],lw:[64,240],rw:[77,248],lh:[207,190],rh:[217,197]})),phase('膝盖着地，肩髋膝成线，保持呼吸',P(plankElbows,{lh:[183,201],rh:[193,207],lk:[225,243],rk:[238,249],la:[267,207],ra:[281,213]}))],{hold:true}),
  spec('side-plank',[phase('侧卧，前臂撑地，髋部先落下',P(sidePlank,{head:[84,168],neck:[103,181],ls:[118,188],rs:[125,177],re:[145,148],rw:[166,116],lh:[191,236],rh:[196,227],lk:[242,241],rk:[247,232]})),phase('侧向前臂支撑，髋部抬起并保持',sidePlank)],{hold:true}),
  spec('knee-side-plank',[phase('屈膝侧卧，前臂撑地准备',P(sidePlank,{head:[84,168],neck:[103,181],ls:[118,188],rs:[125,177],re:[145,148],rw:[166,116],lh:[178,229],rh:[183,220],lk:[221,242],rk:[226,233],la:[274,238],ra:[279,229]})),phase('屈膝侧向支撑，抬髋保持',P(sidePlank,{lh:[178,184],rh:[183,175],lk:[221,242],rk:[226,233],la:[274,238],ra:[279,229]}))],{hold:true}),
  spec('dead-bug',[phase('仰卧，髋膝约 90 度，双臂朝上',deadbug),phase('对侧手脚伸远，腰背稳定',P(deadbug,{lw:[43,236],le:[74,225],rk:[246,236],ra:[294,244]})),phase('收回手脚',deadbug),phase('换另一组对侧手脚',P(deadbug,{rw:[55,247],re:[87,239],lk:[237,229],la:[283,237]}))]),
  spec('bird-dog',[phase('四点支撑',quadruped),phase('对侧手脚伸远',P(quadruped,{le:[74,148],lw:[34,149],rk:[269,156],ra:[318,152]})),phase('回到四点支撑',quadruped),phase('换另一侧伸展',P(quadruped,{re:[88,156],rw:[47,159],lk:[259,148],la:[308,143]}))]),
  spec('heel-tap',[phase('仰卧，髋膝约 90 度，双臂放身侧',P(deadbug,{le:[139,249],re:[144,251],lw:[172,249],rw:[179,251]})),phase('一侧腿缓慢下落，脚跟轻点地',P(deadbug,{le:[139,249],re:[144,251],lw:[172,249],rw:[179,251],rk:[236,215],ra:[267,249]})),phase('收回到抬腿姿势',P(deadbug,{le:[139,249],re:[144,251],lw:[172,249],rw:[179,251]})),phase('另一侧脚跟轻点地',P(deadbug,{le:[139,249],re:[144,251],lw:[172,249],rw:[179,251],lk:[222,211],la:[253,245]}))]),
  spec('reverse-crunch',[phase('仰卧，双腿屈膝抬起',P(deadbug,{le:[139,249],re:[144,251],lw:[172,249],rw:[179,251]})),phase('轻卷骨盆，膝盖靠近躯干',reverseCrunch),phase('控制回到起点',P(deadbug,{le:[139,249],re:[144,251],lw:[172,249],rw:[179,251]}))]),
  spec('crunch',[phase('仰卧屈膝，双手轻扶头侧',crunchRest),phase('收腹抬起肩胛，下巴留空',crunch),phase('缓慢落下',crunchRest)]),
  spec('bicycle-crunch',[phase('肩胛离地，一腿屈曲一腿伸远',P(crunch,{lk:[182,190],la:[231,191],rk:[247,232],ra:[296,243],re:[156,205],rw:[116,203]})),phase('换腿并轻转上身',P(crunch,{head:[104,207],neck:[120,222],ls:[135,230],rs:[141,237],lk:[238,225],la:[286,235],rk:[196,198],ra:[246,201],le:[161,212],lw:[120,209],re:[119,199],rw:[91,206]}))]),
  spec('seated-russian-twist',[phase('坐稳，脚跟着地，双手在胸前',seated),phase('躯干轻转，双手移向一侧',P(seated,{ls:[142,136],rs:[160,132],le:[119,162],re:[139,160],lw:[110,184],rw:[119,184]})),phase('回正并转向另一侧',P(seated,{ls:[132,131],rs:[157,136],le:[171,162],re:[193,165],lw:[209,188],rw:[216,184]}))],{view:'oblique'}),
  spec('lying-leg-raise',[phase('仰卧，双腿向上伸直',P(supine,{lk:[201,188],rk:[213,196],la:[216,135],ra:[228,143]})),phase('腰背稳定，缓慢降低双腿',P(supine,{lk:[238,222],rk:[249,230],la:[291,204],ra:[303,212]})),phase('控制抬回双腿',P(supine,{lk:[201,188],rk:[213,196],la:[216,135],ra:[228,143]}))]),
  spec('plank-shoulder-tap',[phase('高位支撑，双脚略宽',P(push,{ra:[316,249]})),phase('一手轻触对侧肩',P(push,{ra:[316,249],re:[146,181],rw:[107,152]})),phase('手放回地面',P(push,{ra:[316,249]})),phase('另一手轻触对侧肩',P(push,{ra:[316,249],le:[138,176],lw:[121,157]}))]),
  spec('bear-hold',[phase('双手在肩下，膝盖在髋下',quadruped),phase('四点支撑，膝盖轻离地并保持',P(quadruped,{lk:[211,227],rk:[224,233],la:[264,247],ra:[277,249]}))],{hold:true}),
  spec('dumbbell-suitcase-march',[phase('单手持铃，身体保持直立',stand),phase('一侧提膝，躯干不侧倾',P(stand,{lk:[143,176],la:[145,223]})),phase('落脚站稳',stand),phase('另一侧提膝',P(stand,{rk:[217,176],ra:[215,223]}))],{...frontDB,weights:'right'}),
  spec('march-in-place',[phase('自然站立',stand),phase('抬起一侧膝盖并摆臂',march),phase('换脚踏步',P(stand,{rk:[220,178],ra:[219,222],re:[213,104],rw:[197,86],le:[141,116],lw:[135,145]}))],{...front,duration:2400}),
  spec('step-jack',[phase('双脚并拢，双臂垂下',P(stand,{la:[175,247],ra:[185,247]})),phase('一脚向侧迈，双臂上举',P(stand,{rk:[225,201],ra:[253,247],le:[131,54],re:[229,54],lw:[149,23],rw:[211,23]})),phase('收脚放下手臂',P(stand,{la:[175,247],ra:[185,247]})),phase('换脚向侧迈',P(stand,{lk:[135,201],la:[107,247],le:[131,54],re:[229,54],lw:[149,23],rw:[211,23]}))],front),
  spec('jumping-jack',[phase('双脚并拢，双臂垂下',P(stand,{la:[175,247],ra:[185,247]})),phase('轻跳开腿，同时举臂',P(wide,{le:[131,54],re:[229,54],lw:[149,23],rw:[211,23],la:[116,238],ra:[244,238]})),phase('轻轻落地，双脚并拢',P(stand,{la:[175,247],ra:[185,247]}))],{...front,duration:2200}),
  spec('high-knees',[phase('一侧膝盖抬至舒适高度',P(march,{lk:[133,153],la:[133,202],re:[222,123],rw:[236,145]})),phase('快速换脚，另一侧提膝',P(stand,{rk:[227,153],ra:[227,202],re:[213,104],rw:[197,86],le:[138,123],lw:[124,145]}))],{...front,duration:1800}),
  spec('mountain-climber',[phase('高位支撑',push),phase('一侧膝盖向前收',P(push,{rk:[153,220],ra:[197,243]})),phase('腿伸回支撑',push),phase('另一侧膝盖向前收',P(push,{lk:[145,210],la:[188,233]}))],{duration:2600}),
  spec('standing-knee-to-elbow',[phase('站直，双手轻扶头侧',P(stand,{le:[133,86],re:[227,86],lw:[155,46],rw:[205,46]})),phase('一膝抬起，对侧肘靠近',P(stand,{head:[176,67],neck:[178,88],ls:[155,99],rs:[198,99],le:[132,108],re:[195,135],lw:[151,70],rw:[180,95],lk:[143,160],la:[140,207]})),phase('站直后换侧',P(stand,{head:[184,67],neck:[182,88],ls:[162,99],rs:[205,99],le:[165,135],re:[228,108],lw:[180,95],rw:[209,70],rk:[217,160],ra:[220,207]}))],front),
  spec('cat-cow',[phase('呼气，背部轻轻拱起',P(quadruped,{head:[90,172],neck:[104,152],ls:[118,142],rs:[128,149],lh:[204,142],rh:[215,149]})),phase('吸气，胸部展开，背部轻下沉',P(quadruped,{head:[78,113],neck:[100,129],ls:[116,153],rs:[126,160],lh:[204,156],rh:[215,163]}))],{spine:true,duration:6000}),
  spec('child-pose',[phase('四点跪姿准备',quadruped),phase('臀部向脚跟坐，手臂前伸，轻松呼吸',child)],{hold:true}),
  spec('thoracic-rotation',[phase('四点支撑，一手轻扶耳侧',P(quadruped,{re:[136,186],rw:[92,145]})),phase('胸椎轻转，手肘朝侧上方打开',P(quadruped,{head:[91,128],neck:[108,141],rs:[131,146],re:[163,102],rw:[114,122]})),phase('控制转回起点',P(quadruped,{re:[136,186],rw:[92,145]}))],{view:'oblique'}),
  spec('half-kneeling-hip-flexor-stretch',[phase('半跪站稳，前脚踩实',P(splitLow,{head:[143,83],neck:[145,104],ls:[143,115],rs:[153,117],le:[129,150],re:[141,159],lw:[110,185],rw:[119,194],lh:[148,177],rh:[158,179],lk:[104,195],la:[104,247],rk:[215,245],ra:[269,247]})),phase('半跪，收紧后侧臀部，髋部轻向前',P(splitLow,{head:[153,88],neck:[155,109],ls:[153,120],rs:[163,122],le:[134,155],re:[146,164],lw:[110,190],rw:[119,199],lh:[158,182],rh:[168,184],lk:[104,195],la:[104,247],rk:[215,245],ra:[269,247]}))],{hold:true}),
  spec('standing-calf-stretch',[phase('双手扶墙，前后站稳',{head:[177,73],neck:[188,92],ls:[198,105],rs:[207,111],le:[233,110],re:[242,120],lw:[269,114],rw:[269,125],lh:[167,167],rh:[176,174],lk:[201,202],rk:[139,211],la:[198,247],ra:[94,235]}),phase('双手扶墙，后膝伸直，后脚跟踩地',{head:[177,73],neck:[188,92],ls:[198,105],rs:[207,111],le:[233,110],re:[242,120],lw:[269,114],rw:[269,125],lh:[167,167],rh:[176,174],lk:[201,202],rk:[130,212],la:[198,247],ra:[86,249]})],{hold:true,wall:280}),
  spec('supine-hamstring-stretch',[phase('仰卧，双手扶住一侧大腿后侧',P(supine,{lk:[213,196],la:[260,205],rk:[249,233],ra:[305,244],le:[149,218],re:[162,228],lw:[196,210],rw:[205,217]})),phase('仰卧，一腿伸直抬起，双手扶住大腿后侧',P(supine,{lk:[213,196],la:[235,143],rk:[249,233],ra:[305,244],le:[149,218],re:[162,228],lw:[196,210],rw:[205,217]}))],{hold:true})
]);
