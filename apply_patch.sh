#!/bin/sh
cat /tmp/patch_header.cmake /opt/JUCE/extras/Build/juceaide/CMakeLists.txt > /tmp/CMakeLists.txt.new
mv /tmp/CMakeLists.txt.new /opt/JUCE/extras/Build/juceaide/CMakeLists.txt
echo "Patch applied successfully"
