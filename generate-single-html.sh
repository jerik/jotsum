#!/bin/bash
# create a single html file 
set -e

echo "start merging javascript and html to one single file"

SOURCE=nebenrechnung.html
FIRST=first.txt
HEAD=head.txt
BODY=body.txt
FINAL=index.html
VERSION=$(git describe --tags --always --dirty)

# get header from source html
cat $SOURCE | grep -B 10000 '</style>' > $FIRST
echo '<script type="text/javascript" charset="utf-8">' >> $FIRST

# include javascript 
cat $FIRST nebenrechnung.js > $HEAD
echo '</script>' >> $HEAD

# get body from source html
cat $SOURCE | grep -A 1000 '</head>' > $BODY

# create final html 
cat $HEAD $BODY > $FINAL

# inject version
sed -i.bak "s|<span id=\"version\"></span>|<span id=\"version\">$VERSION</span>|" $FINAL

# cleanup
rm *.txt
rm *.bak

echo "created single file $FINAL"
