import numpy as np

def bad_cast():
   a = "not an array"
   np.reshape(a, (1,-1))

bad_cast()

