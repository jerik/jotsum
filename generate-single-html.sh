#!/bin/bash
# create a single html file 
set -e

echo "start merging javascript and html to one single file"

SOURCE=jotsum.html
FIRST=first.txt
HEAD=head.txt
BODY=body.txt
FINAL=index.html

# Build-Infos aus Git
COUNT=$(git rev-list --count HEAD)
SHORT=$(git rev-parse --short HEAD)
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VERSION="${COUNT}-g${SHORT}"

# get header from source html
cat $SOURCE | grep -B 10000 '</style>' > $FIRST
echo '<script type="text/javascript" charset="utf-8">' >> $FIRST

# include javascript 
cat $FIRST jotsum.js > $HEAD
echo '</script>' >> $HEAD

# get body from source html
cat $SOURCE | grep -A 1000 '</head>' > $BODY

# create final html 
cat $HEAD $BODY > $FINAL

# inject version
sed -i.bak "s|<span id=\"version\"></span>|<span id=\"version\">$VERSION<br>$DATE</span>|" $FINAL

# cleanup
rm *.txt
rm *.bak

echo "created single file $FINAL"
