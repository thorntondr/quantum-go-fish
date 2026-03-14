# top_css_colors_by_english_frequency.py
import re
import sys
from typing import List

from wordfreq import zipf_frequency


LANG = "en"
TOP_N = 13


def fetch_css_named_colors() -> List[str]:
    return list(CSS_NAMED_COLORS.keys())


# CSS named colors (name -> hex).
CSS_NAMED_COLORS = {
    "aliceblue":"#F0F8FF","antiquewhite":"#FAEBD7","aqua":"#00FFFF","aquamarine":"#7FFFD4","azure":"#F0FFFF",
    "beige":"#F5F5DC","bisque":"#FFE4C4","black":"#000000","blanchedalmond":"#FFEBCD","blue":"#0000FF",
    "blueviolet":"#8A2BE2","brown":"#A52A2A","burlywood":"#DEB887","cadetblue":"#5F9EA0","chartreuse":"#7FFF00",
    "chocolate":"#D2691E","coral":"#FF7F50","cornflowerblue":"#6495ED","cornsilk":"#FFF8DC","crimson":"#DC143C",
    "cyan":"#00FFFF","darkblue":"#00008B","darkcyan":"#008B8B","darkgoldenrod":"#B8860B","darkgray":"#A9A9A9",
    "darkgreen":"#006400","darkgrey":"#A9A9A9","darkkhaki":"#BDB76B","darkmagenta":"#8B008B",
    "darkolivegreen":"#556B2F","darkorange":"#FF8C00","darkorchid":"#9932CC","darkred":"#8B0000",
    "darksalmon":"#E9967A","darkseagreen":"#8FBC8F","darkslateblue":"#483D8B","darkslategray":"#2F4F4F",
    "darkslategrey":"#2F4F4F","darkturquoise":"#00CED1","darkviolet":"#9400D3","deeppink":"#FF1493",
    "deepskyblue":"#00BFFF","dimgray":"#696969","dimgrey":"#696969","dodgerblue":"#1E90FF",
    "firebrick":"#B22222","floralwhite":"#FFFAF0","forestgreen":"#228B22","fuchsia":"#FF00FF","gainsboro":"#DCDCDC",
    "ghostwhite":"#F8F8FF","gold":"#FFD700","goldenrod":"#DAA520","gray":"#808080","green":"#008000",
    "greenyellow":"#ADFF2F","grey":"#808080","honeydew":"#F0FFF0","hotpink":"#FF69B4","indianred":"#CD5C5C",
    "indigo":"#4B0082","ivory":"#FFFFF0","khaki":"#F0E68C","lavender":"#E6E6FA","lavenderblush":"#FFF0F5",
    "lawngreen":"#7CFC00","lemonchiffon":"#FFFACD","lightblue":"#ADD8E6","lightcoral":"#F08080",
    "lightcyan":"#E0FFFF","lightgoldenrodyellow":"#FAFAD2","lightgray":"#D3D3D3","lightgreen":"#90EE90",
    "lightgrey":"#D3D3D3","lightpink":"#FFB6C1","lightsalmon":"#FFA07A","lightseagreen":"#20B2AA",
    "lightskyblue":"#87CEFA","lightslategray":"#778899","lightslategrey":"#778899","lightsteelblue":"#B0C4DE",
    "lightyellow":"#FFFFE0","lime":"#00FF00","limegreen":"#32CD32","linen":"#FAF0E6","magenta":"#FF00FF",
    "maroon":"#800000","mediumaquamarine":"#66CDAA","mediumblue":"#0000CD","mediumorchid":"#BA55D3",
    "mediumpurple":"#9370DB","mediumseagreen":"#3CB371","mediumslateblue":"#7B68EE","mediumspringgreen":"#00FA9A",
    "mediumturquoise":"#48D1CC","mediumvioletred":"#C71585","midnightblue":"#191970","mintcream":"#F5FFFA",
    "mistyrose":"#FFE4E1","moccasin":"#FFE4B5","navajowhite":"#FFDEAD","navy":"#000080","oldlace":"#FDF5E6",
    "olive":"#808000","olivedrab":"#6B8E23","orange":"#FFA500","orangered":"#FF4500","orchid":"#DA70D6",
    "palegoldenrod":"#EEE8AA","palegreen":"#98FB98","paleturquoise":"#AFEEEE","palevioletred":"#DB7093",
    "papayawhip":"#FFEFD5","peachpuff":"#FFDAB9","peru":"#CD853F","pink":"#FFC0CB","plum":"#DDA0DD",
    "powderblue":"#B0E0E6","purple":"#800080","rebeccapurple":"#663399","red":"#FF0000","rosybrown":"#BC8F8F",
    "royalblue":"#4169E1","saddlebrown":"#8B4513","salmon":"#FA8072","sandybrown":"#F4A460","seagreen":"#2E8B57",
    "seashell":"#FFF5EE","sienna":"#A0522D","silver":"#C0C0C0","skyblue":"#87CEEB","slateblue":"#6A5ACD",
    "slategray":"#708090","slategrey":"#708090","snow":"#FFFAFA","springgreen":"#00FF7F","steelblue":"#4682B4",
    "tan":"#D2B48C","teal":"#008080","thistle":"#D8BFD8","tomato":"#FF6347","turquoise":"#40E0D0",
    "violet":"#EE82EE","wheat":"#F5DEB3","white":"#FFFFFF","whitesmoke":"#F5F5F5","yellow":"#FFFF00",
    "yellowgreen":"#9ACD32",
# # standard English versions
#     'alice blue': '#F0F8FF', 'antique white': '#FAEBD7', 'blanched almond': '#FFEBCD', 'blue violet': '#8A2BE2',
#     'burly wood': '#DEB887', 'cadet blue': '#5F9EA0', 'cornflower blue': '#6495ED', 'dark blue': '#00008B',
#     'dark cyan': '#008B8B', 'dark goldenrod': '#B8860B', 'dark gray': '#A9A9A9', 'dark green': '#006400',
#     'dark grey': '#A9A9A9', 'dark khaki': '#BDB76B', 'dark magenta': '#8B008B', 'dark olive green': '#556B2F',
#     'dark orange': '#FF8C00', 'dark orchid': '#9932CC', 'dark red': '#8B0000', 'dark salmon': '#E9967A',
#     'dark sea green': '#8FBC8F', 'dark slate blue': '#483D8B', 'dark slate gray': '#2F4F4F',
#     'dark slate grey': '#2F4F4F', 'dark turquoise': '#00CED1', 'dark violet': '#9400D3', 'deep pink': '#FF1493',
#     'deep sky blue': '#00BFFF', 'dim gray': '#696969', 'dim grey': '#696969', 'dodger blue': '#1E90FF',
#     'fire brick': '#B22222', 'floral white': '#FFFAF0', 'forest green': '#228B22', 'ghost white': '#F8F8FF',
#     'green yellow': '#ADFF2F', 'honey dew': '#F0FFF0', 'hot pink': '#FF69B4', 'indian red': '#CD5C5C',
#     'lavender blush': '#FFF0F5', 'lawn green': '#7CFC00', 'lemon chiffon': '#FFFACD', 'light blue': '#ADD8E6',
#     'light coral': '#F08080', 'light cyan': '#E0FFFF', 'light goldenrod yellow': '#FAFAD2', 'light gray': '#D3D3D3',
#     'light green': '#90EE90', 'light grey': '#D3D3D3', 'light pink': '#FFB6C1', 'light salmon': '#FFA07A',
#     'light sea green': '#20B2AA', 'light sky blue': '#87CEFA', 'light slate gray': '#778899',
#     'light slate grey': '#778899', 'light steel blue': '#B0C4DE', 'light yellow': '#FFFFE0', 'lime green': '#32CD32',
#     'medium aquamarine': '#66CDAA', 'medium blue': '#0000CD', 'medium orchid': '#BA55D3', 'medium purple': '#9370DB',
#     'medium sea green': '#3CB371', 'medium slate blue': '#7B68EE', 'medium spring green': '#00FA9A',
#     'medium turquoise': '#48D1CC', 'medium violet red': '#C71585', 'midnight blue': '#191970', 'mint cream': '#F5FFFA',
#     'misty rose': '#FFE4E1', 'navajo white': '#FFDEAD', 'old lace': '#FDF5E6', 'olive drab': '#6B8E23',
#     'orange red': '#FF4500', 'pale goldenrod': '#EEE8AA', 'pale green': '#98FB98', 'pale turquoise': '#AFEEEE',
#     'pale violet red': '#DB7093', 'papaya whip': '#FFEFD5', 'peach puff': '#FFDAB9', 'powder blue': '#B0E0E6',
#     'rebecca purple': '#663399', 'rosy brown': '#BC8F8F', 'royal blue': '#4169E1', 'saddle brown': '#8B4513',
#     'sandy brown': '#F4A460', 'sea green': '#2E8B57', 'sea shell': '#FFF5EE', 'sky blue': '#87CEEB',
#     'slate blue': '#6A5ACD', 'slate gray': '#708090', 'slate grey': '#708090', 'spring green': '#00FF7F',
#     'steel blue': '#4682B4', 'white smoke': '#F5F5F5', 'yellow green': '#9ACD32', "corn silk":"#FFF8DC",
# # alternate word breaks
#     'corn flower blue': '#6495ED', 'dark seagreen': "#8FBC8F", "medium seagreen": "#3CB371", "light seagreen": "20B2AA",
}

COMMON_COLOR_NAMES = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'orange', 'purple', 'violet', 'cyan', 'gold', 'olive', 'turquoise', 'vermilion', 'sapphire', 'navy', 'beige', 'tan', 'maroon', 'teal', 'turquoise']
IGNORE = ['white', 'black', 'gray', 'grey', 'silver', 'snow', 'ivory', 'gold']

OKABE_ITO_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000']

def english_frequency(name: str) -> float:
    return zipf_frequency(name, LANG)


def main() -> int:
    try:
        names = fetch_css_named_colors()
    except Exception as exc:
        print(f"Error fetching CSS named colors: {exc}", file=sys.stderr)
        return 1

    by_hex = {}
    for name in names:
        if any(x in name for x in IGNORE):
            continue
        hex_value = CSS_NAMED_COLORS.get(name)
        if not hex_value:
            continue
        score = english_frequency(name)
        entry = by_hex.setdefault(hex_value, {"score": 0.0, "aliases": []})
        if name not in [alias for alias, _ in entry["aliases"]]:
            entry["aliases"].append((name, score))
        entry["score"] = max(score, entry["score"])

    ranked = sorted(by_hex.items(), key=lambda item: item[1]["score"], reverse=True)

    print(f"Top {TOP_N} CSS colors by English frequency (combined by hex):")
    for i, (hex_value, data) in enumerate(ranked[:TOP_N], 1):
        aliases = sorted(data["aliases"], key=lambda x: x[1], reverse=True)
        primary = aliases[0][0]
        alias_list = ", ".join(a for a, _ in aliases)
        print(f"{i:>2}. {primary:<20} {data['score']:.2f}  {hex_value}  [{alias_list}]")
    for i, (hex_value, data) in enumerate(ranked[:TOP_N], 1):
        print(f'[{int(hex_value[-2:], 16)},{int(hex_value[-4:-2], 16)},{int(hex_value[-6:-4], 16)}],') 
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
