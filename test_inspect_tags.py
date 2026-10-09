"""Small CardDefs fixture for the tag audit importer."""

import io
import unittest

from inspect_assemble_tags import HERE, read_carddefs, simulator_cards


class InspectTagsTest(unittest.TestCase):
    def test_reads_numeric_tags_and_matches_dbf_id(self):
        card = simulator_cards(HERE / "data.js")[0]
        xml = (
            '<CardDefs version="trial-test"><Entity CardID="TRIAL_001" ID="{}">'
            '<Tag enumID="185" name="CARDNAME" type="LocString"><zhCN>测试牌</zhCN></Tag>'
            '<Tag enumID="4533" name="ASSEMBLE_COMPONENT" type="Bool" value="1"/>'
            '<Tag enumID="4546" name="ASSEMBLE_NOT_PRIMARY" type="Bool" value="1"/>'
            '</Entity></CardDefs>'
        ).format(card["dbf"])
        build, extracted = read_carddefs(io.StringIO(xml))
        self.assertEqual(build, "trial-test")
        self.assertEqual(extracted[0]["dbf"], card["dbf"])
        self.assertEqual(extracted[0]["tags"], {4533: 1, 4546: 1})
        self.assertEqual(extracted[0]["name"], "测试牌")


if __name__ == "__main__":
    unittest.main()
